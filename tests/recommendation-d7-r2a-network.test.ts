import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NodeResearchDnsResolver, resolvePinnedResearchAddress } from "@/features/recommendations/research/network/dns-policy";
import { validatePublicResearchAddress } from "@/features/recommendations/research/network/ip-policy";
import { assertResearchContentType, decodeStrictUtf8, readBoundedResearchBody } from "@/features/recommendations/research/network/response-limits";
import { createPinnedHttpsRequestOptions, createPinnedResearchLookup, SecureResearchHttpClientImpl } from "@/features/recommendations/research/network/secure-http-client";
import { SecureResearchHttpError, type ResearchTransportRequest, type SecureResearchHttpRequest } from "@/features/recommendations/research/network/types";
import { FakeResearchDnsResolver, FakeResearchHttpsTransport, fakeTransportJson } from "@/features/recommendations/research/testing/fakes";

const PUBLIC = [{ address: "1.1.1.1", family: 4 as const }];
const baseRequest = (url = "https://www.wikidata.org/w/api.php"): SecureResearchHttpRequest => ({
  sourceId: "wikidata", url, method: "GET", headers: { userAgent: "MediaTracker/0.1 (contact@example.invalid)", accept: "application/json", acceptEncoding: "gzip, deflate" },
  timeoutMs: 1_000, maxResponseBytes: 4096, acceptedContentTypes: ["application/json"], redirectPolicy: { mode: "manual", maxRedirects: 2 }, requestId: "test-request", maxAttempts: 2,
});

describe("D7-R2A IP/DNS policy", () => {
  it("OS lookup adapter all+verbatim kullanır ve multiple public family/address çiftlerini korur", async () => {
    const calls: Array<{ hostname: string; options: unknown }> = [];
    const resolver = new NodeResearchDnsResolver(async (hostname, options) => {
      calls.push({ hostname, options });
      return [
        { address: "2606:4700:4700::1111", family: 6 },
        { address: "1.1.1.1", family: 4 },
        { address: "8.8.8.8", family: 4 },
      ];
    });
    await expect(resolver.resolve("www.wikidata.org")).resolves.toEqual([
      { address: "2606:4700:4700::1111", family: 6 },
      { address: "1.1.1.1", family: 4 },
      { address: "8.8.8.8", family: 4 },
    ]);
    expect(calls).toEqual([{ hostname: "www.wikidata.org", options: { all: true, verbatim: true } }]);
  });

  it.each([
    [[{ address: "1.1.1.1", family: 4 }], [4]],
    [[{ address: "2606:4700:4700::1111", family: 6 }], [6]],
  ] as const)("OS lookup adapter IPv4/IPv6-only sonucu korur: %j", async (rows, families) => {
    const result = await new NodeResearchDnsResolver(async () => rows).resolve("www.wikidata.org");
    expect(result.map((row) => row.family)).toEqual(families);
  });

  it("empty lookup ile lookup exception'ını ayırır ve bounded error code'u internal tutar", async () => {
    const empty = new NodeResearchDnsResolver(async () => []);
    await expect(resolvePinnedResearchAddress({ hostname: "www.wikidata.org", resolver: empty })).rejects.toMatchObject({ kind: "dns_result_empty", reason: "dns_result_empty" });

    for (const code of ["ENOTFOUND", "EAI_AGAIN"] as const) {
      const failed = new NodeResearchDnsResolver(async () => { throw Object.assign(new Error("raw resolver detail"), { code }); });
      await expect(failed.resolve("www.wikidata.org")).rejects.toMatchObject({
        kind: "dns_lookup_failed", reason: "dns_lookup_failed", internalCode: code,
      });
    }
  });

  it("DNS lookup error code'unu bounded internal telemetry'de korur, public reason'a taşımaz", async () => {
    const resolver = new NodeResearchDnsResolver(async () => {
      throw Object.assign(new Error("sensitive local resolver detail"), { code: "ENOTFOUND" });
    });
    const client = new SecureResearchHttpClientImpl(resolver, new FakeResearchHttpsTransport([fakeTransportJson()]));
    let captured: unknown;
    try {
      await client.request(baseRequest());
    } catch (error) {
      captured = error;
    }
    expect(captured).toMatchObject({ kind: "dns_lookup_failed", reason: "dns_lookup_failed", internalCode: "ENOTFOUND" });
    expect((captured as Error).message).not.toContain("ENOTFOUND");
    expect((captured as Error).message).not.toContain("sensitive local resolver detail");
    expect(client.snapshotTelemetry()).toMatchObject({ dnsLookupFailures: 1, dnsLastErrorCode: "ENOTFOUND" });
  });

  it.each([
    ["127.0.0.1", 4], ["10.0.0.1", 4], ["169.254.169.254", 4], ["224.0.0.1", 4],
    ["192.0.2.1", 4], ["100.64.0.1", 4], ["::1", 6], ["fc00::1", 6], ["fe80::1", 6],
    ["ff02::1", 6], ["2001:db8::1", 6], ["::ffff:10.0.0.1", 6],
  ] as const)("public olmayan %s adresini reddeder", (address, family) => {
    expect(validatePublicResearchAddress({ address, family })).toMatchObject({ ok: false });
  });

  it("public IPv4/IPv6 kabul eder", () => {
    expect(validatePublicResearchAddress({ address: "1.1.1.1", family: 4 })).toMatchObject({ ok: true });
    expect(validatePublicResearchAddress({ address: "2606:4700:4700::1111", family: 6 })).toMatchObject({ ok: true });
  });

  it("mixed public/private DNS sonucunu fail-closed reddeder", async () => {
    await expect(resolvePinnedResearchAddress({ hostname: "www.wikidata.org", resolver: new FakeResearchDnsResolver([[...PUBLIC, { address: "10.0.0.1", family: 4 }]]) })).rejects.toMatchObject({ kind: "dns_security_rejected" });
  });

  it("all-private DNS sonucunu fail-closed reddeder", async () => {
    await expect(resolvePinnedResearchAddress({ hostname: "www.wikidata.org", resolver: new FakeResearchDnsResolver([[{ address: "10.0.0.1", family: 4 }]]) })).rejects.toMatchObject({ kind: "dns_security_rejected", reason: "dns_address_private" });
  });

  it("boş DNS ve bounded timeout ayrımını korur", async () => {
    await expect(resolvePinnedResearchAddress({ hostname: "www.wikidata.org", resolver: new FakeResearchDnsResolver([[]]) })).rejects.toMatchObject({ kind: "dns_result_empty" });
    await expect(resolvePinnedResearchAddress({ hostname: "www.wikidata.org", resolver: { resolve: () => new Promise(() => undefined) }, timeoutMs: 5 })).rejects.toMatchObject({ kind: "dns_timeout" });
  });

  it("aynı validated address setinde deterministic public adres seçer", async () => {
    const result = await resolvePinnedResearchAddress({
      hostname: "www.wikidata.org",
      resolver: new FakeResearchDnsResolver([[
        { address: "2606:4700:4700::1111", family: 6 },
        { address: "8.8.8.8", family: 4 },
        { address: "1.1.1.1", family: 4 },
      ]]),
    });
    expect(result.pinnedAddress).toEqual({ address: "1.1.1.1", family: 4 });
  });
});

describe("D7-R2A pinned HTTPS, redirect ve retry", () => {
  it("tek bağlantıda DNS sonucunu pinler; fake rebinding ikinci resolve'a ulaşmaz", async () => {
    const resolver = new FakeResearchDnsResolver([PUBLIC, [{ address: "10.0.0.1", family: 4 }]]);
    const transport = new FakeResearchHttpsTransport([fakeTransportJson()]);
    const response = await new SecureResearchHttpClientImpl(resolver, transport).request(baseRequest());
    expect(response.status).toBe(200);
    expect(resolver.hostnames).toEqual(["www.wikidata.org"]);
    expect(transport.requests[0].pinnedAddress).toEqual(PUBLIC[0]);
    expect(transport.requests[0].hostname).toBe("www.wikidata.org");
  });

  it("redirect yeni DNS validation alır ve private hedef çözümünü reddeder", async () => {
    const resolver = new FakeResearchDnsResolver([PUBLIC, [{ address: "10.0.0.2", family: 4 }]]);
    const transport = new FakeResearchHttpsTransport([fakeTransportJson({ status: 302, headers: { location: "/next" } })]);
    await expect(new SecureResearchHttpClientImpl(resolver, transport).request(baseRequest())).rejects.toMatchObject({ kind: "dns_security_rejected" });
    expect(resolver.hostnames).toHaveLength(2);
    expect(transport.requests).toHaveLength(1);
  });

  it.each([
    ["https://evil.example/path", "host_not_allowlisted"],
    ["http://www.wikidata.org/path", "https_required"],
    ["https://user:pass@www.wikidata.org/path", "userinfo_forbidden"],
    ["https://www.wikidata.org:444/path", "non_default_port_forbidden"],
  ])("redirect hedefi %s için reddedilir", async (location, reason) => {
    const transport = new FakeResearchHttpsTransport([fakeTransportJson({ status: 302, headers: { location } })]);
    await expect(new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC]), transport).request(baseRequest())).rejects.toMatchObject({ kind: "redirect_rejected", reason });
  });

  it("redirect loop ve limit reddedilir", async () => {
    const loopTransport = new FakeResearchHttpsTransport([fakeTransportJson({ status: 302, headers: { location: "/w/api.php" } })]);
    await expect(new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC]), loopTransport).request(baseRequest())).rejects.toMatchObject({ reason: "redirect_loop" });
    const limitTransport = new FakeResearchHttpsTransport([fakeTransportJson({ status: 302, headers: { location: "/next" } })]);
    await expect(new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC]), limitTransport).request({ ...baseRequest(), redirectPolicy: { mode: "manual", maxRedirects: 0 } })).rejects.toMatchObject({ reason: "redirect_limit_exceeded" });
  });

  it("429/5xx bir kez retry olur, permanent 4xx olmaz", async () => {
    const slept: number[] = [];
    const retryTransport = new FakeResearchHttpsTransport([
      fakeTransportJson({ status: 429, headers: { "retry-after": "9" } }), fakeTransportJson({ status: 200 }),
    ]);
    const retry = await new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC, PUBLIC]), retryTransport, async (ms) => { slept.push(ms); }).request(baseRequest());
    expect(retry.retryCount).toBe(1);
    expect(slept).toEqual([1000]);
    const noRetryTransport = new FakeResearchHttpsTransport([fakeTransportJson({ status: 404 })]);
    expect((await new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC]), noRetryTransport).request(baseRequest())).status).toBe(404);
    expect(noRetryTransport.requests).toHaveLength(1);

    const serviceUnavailable = new FakeResearchHttpsTransport([
      fakeTransportJson({ status: 503 }), fakeTransportJson({ status: 200 }),
    ]);
    const recovered = await new SecureResearchHttpClientImpl(
      new FakeResearchDnsResolver([PUBLIC, PUBLIC]), serviceUnavailable, async () => undefined,
    ).request(baseRequest());
    expect(recovered).toMatchObject({ status: 200, retryCount: 1 });
  });

  it("transient network/timeout retry olur; security error retry olmaz", async () => {
    const transport = new FakeResearchHttpsTransport([new SecureResearchHttpError("connect_failed", "temporary", true), fakeTransportJson()]);
    expect((await new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC, PUBLIC]), transport).request(baseRequest())).retryCount).toBe(1);
    const rejected = new FakeResearchHttpsTransport([new SecureResearchHttpError("security_rejected", "blocked")]);
    await expect(new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC]), rejected).request(baseRequest())).rejects.toMatchObject({ kind: "security_rejected" });
    expect(rejected.requests).toHaveLength(1);
  });

  it("aynı canonical request'i coalesce eder", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const transport = new FakeResearchHttpsTransport([async () => { await gate; return fakeTransportJson(); }]);
    const client = new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC]), transport);
    const first = client.request(baseRequest());
    const second = client.request(baseRequest());
    release?.();
    await Promise.all([first, second]);
    expect(transport.requests).toHaveLength(1);
    expect(client.snapshotTelemetry().coalescedRequests).toBe(1);
  });

  it("tek request/retry için OS resolver'ı bir kez çağırır ve aynı prevalidated pin'i korur", async () => {
    let lookupCount = 0;
    const resolver = new NodeResearchDnsResolver(async () => {
      lookupCount += 1;
      return PUBLIC;
    });
    const transport = new FakeResearchHttpsTransport([
      new SecureResearchHttpError("connect_failed", "connect_failed", true),
      fakeTransportJson(),
    ]);
    const response = await new SecureResearchHttpClientImpl(resolver, transport).request(baseRequest());
    expect(response.retryCount).toBe(1);
    expect(lookupCount).toBe(1);
    expect(transport.requests.map((request) => request.pinnedAddress)).toEqual([PUBLIC[0], PUBLIC[0]]);
  });

  it("custom lookup exact pinned family/address döndürür; TLS servername ve Host canonical kalır", async () => {
    const transportRequest: ResearchTransportRequest = {
      url: "https://www.wikidata.org/w/api.php", hostname: "www.wikidata.org", pinnedAddress: PUBLIC[0],
      headers: { "user-agent": "MediaTracker/0.1 (contact@example.invalid)", accept: "application/json" },
      timeoutMs: 1_000, maxResponseBytes: 4_096, acceptedContentTypes: ["application/json"],
    };
    const options = createPinnedHttpsRequestOptions(transportRequest);
    expect(options.servername).toBe("www.wikidata.org");
    expect(options.headers).toMatchObject({ host: "www.wikidata.org" });

    const lookup = createPinnedResearchLookup(PUBLIC[0]);
    const pinned = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      lookup("ignored.example", { family: 0 }, (error, address, family) => {
        if (error) reject(error);
        else resolve({ address, family });
      });
    });
    expect(pinned).toEqual(PUBLIC[0]);
  });

  it("aynı Wikimedia host'una farklı request'leri seri bağlar", async () => {
    let active = 0;
    let maxActive = 0;
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let callCount = 0;
    const transport = {
      request: async () => {
        callCount += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (callCount === 1) await firstGate;
        active -= 1;
        return fakeTransportJson();
      },
    };
    const client = new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC, PUBLIC]), transport);
    const first = client.request(baseRequest("https://www.wikidata.org/w/api.php?a=1"));
    await vi.waitFor(() => expect(callCount).toBe(1));
    const second = client.request(baseRequest("https://www.wikidata.org/w/api.php?a=2"));
    await Promise.resolve();
    expect(maxActive).toBe(1);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(maxActive).toBe(1);
  });

  it.each([
    ["https://evil.www.wikidata.org/w/api.php", "host_not_allowlisted"],
    ["https://127.0.0.1/w/api.php", "ip_literal_forbidden"],
  ])("ilk request URL'si %s için DNS açmadan reddedilir", async (url, reason) => {
    const resolver = new FakeResearchDnsResolver([PUBLIC]);
    const client = new SecureResearchHttpClientImpl(resolver, new FakeResearchHttpsTransport([fakeTransportJson()]));
    await expect(client.request(baseRequest(url))).rejects.toMatchObject({ kind: "security_rejected", reason });
    expect(resolver.hostnames).toHaveLength(0);
  });

  it("GET dışı method ve arbitrary header runtime'da reddedilir", async () => {
    const client = new SecureResearchHttpClientImpl(new FakeResearchDnsResolver([PUBLIC]), new FakeResearchHttpsTransport([fakeTransportJson()]));
    await expect(client.request({ ...baseRequest(), method: "POST" as "GET" })).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(client.request({ ...baseRequest(), headers: { ...baseRequest().headers, Authorization: "secret" } as never })).rejects.toMatchObject({ reason: "arbitrary_header_forbidden" });
  });
});

describe("D7-R2A streaming/content limits", () => {
  it("decompressed byte limit uygular ve content-length'e güvenmez", async () => {
    const zipped = gzipSync(Buffer.from("x".repeat(5000)));
    await expect(readBoundedResearchBody({ stream: Readable.from([zipped]), contentEncoding: "gzip", maxBytes: 1000 })).rejects.toMatchObject({ kind: "oversized_content" });
  });

  it("JSON content type charset'i kabul eder, HTML'i reddeder", () => {
    expect(assertResearchContentType("application/json; charset=utf-8", ["application/json"])).toBe("application/json");
    expect(() => assertResearchContentType("text/html", ["application/json"])).toThrowError(/content_type_rejected/);
  });

  it("invalid UTF-8 ve unsupported content-encoding reddedilir", async () => {
    expect(() => decodeStrictUtf8(Uint8Array.from([0xc3, 0x28]))).toThrowError(/invalid_encoding/);
    await expect(readBoundedResearchBody({ stream: Readable.from([Buffer.from("x")]), contentEncoding: "br", maxBytes: 10 })).rejects.toMatchObject({ kind: "invalid_encoding" });
  });
});
