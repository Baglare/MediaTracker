import type {
  ResearchDnsResolver,
  ResearchHttpsTransport,
  ResearchTransportRequest,
  ResearchTransportResponse,
  ResolvedResearchAddress,
  SecureResearchHttpClient,
  SecureResearchHttpRequest,
  SecureResearchHttpResponse,
} from "../network/types";

export class FakeResearchDnsResolver implements ResearchDnsResolver {
  readonly hostnames: string[] = [];
  private cursor = 0;

  constructor(private readonly results: readonly (readonly ResolvedResearchAddress[])[]) {}

  async resolve(hostname: string): Promise<readonly ResolvedResearchAddress[]> {
    this.hostnames.push(hostname);
    const result = this.results[Math.min(this.cursor, this.results.length - 1)] ?? [];
    this.cursor += 1;
    return result;
  }
}

export class FakeResearchHttpsTransport implements ResearchHttpsTransport {
  readonly requests: ResearchTransportRequest[] = [];
  private cursor = 0;

  constructor(
    private readonly responses: readonly (ResearchTransportResponse | Error | (() => Promise<ResearchTransportResponse>))[],
  ) {}

  async request(input: ResearchTransportRequest): Promise<ResearchTransportResponse> {
    this.requests.push(input);
    const response = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    if (response instanceof Error) throw response;
    if (typeof response === "function") return response();
    if (!response) throw new Error("fake_transport_response_missing");
    return response;
  }
}

export function fakeTransportJson(input: {
  status?: number;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  contentType?: string;
} = {}): ResearchTransportResponse {
  const body = new TextEncoder().encode(JSON.stringify(input.body ?? {}));
  return {
    status: input.status ?? 200,
    headers: { "content-type": input.contentType ?? "application/json", ...(input.headers ?? {}) },
    body,
    bytesRead: body.byteLength,
    contentType: input.contentType ?? "application/json",
  };
}

export class FakeSecureResearchHttpClient implements SecureResearchHttpClient {
  readonly requests: SecureResearchHttpRequest[] = [];
  private cursor = 0;

  constructor(private readonly responses: readonly (SecureResearchHttpResponse | Error)[]) {}

  async request(input: SecureResearchHttpRequest): Promise<SecureResearchHttpResponse> {
    this.requests.push(input);
    const response = this.responses[Math.min(this.cursor, this.responses.length - 1)];
    this.cursor += 1;
    if (response instanceof Error) throw response;
    if (!response) throw new Error("fake_http_response_missing");
    return response;
  }
}

export function fakeHttpJson(body: unknown, input: { status?: number; finalUrl?: string } = {}): SecureResearchHttpResponse {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    finalUrl: input.finalUrl ?? "https://www.wikidata.org/w/api.php",
    status: input.status ?? 200,
    headers: { "content-type": "application/json" },
    body: bytes,
    bytesRead: bytes.byteLength,
    contentType: "application/json",
    durationMs: 1,
    redirectChain: [],
    resolvedAddresses: [{ address: "1.1.1.1", family: 4 }],
    retryCount: 0,
    warnings: [],
  };
}

