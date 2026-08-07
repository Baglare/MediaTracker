import "server-only";

import { lookup } from "node:dns/promises";
import { validatePublicResearchAddress } from "./ip-policy";
import type { ResearchDnsResolver, ResolvedResearchAddress } from "./types";
import { boundedResearchNetworkErrorCode, SecureResearchHttpError } from "./types";

export const RESEARCH_DNS_TIMEOUT_MS = 1_250;

export interface ResearchOsLookupOptions {
  all: true;
  verbatim: true;
}

export type ResearchOsLookup = (
  hostname: string,
  options: ResearchOsLookupOptions,
) => Promise<readonly { address: string; family: number }[]>;

const defaultResearchOsLookup: ResearchOsLookup = (hostname, options) => lookup(hostname, options);

export class NodeResearchDnsResolver implements ResearchDnsResolver {
  constructor(private readonly osLookup: ResearchOsLookup = defaultResearchOsLookup) {}

  async resolve(hostname: string): Promise<readonly ResolvedResearchAddress[]> {
    try {
      const rows = await this.osLookup(hostname, { all: true, verbatim: true });
      if (rows.some((row) => row.family !== 4 && row.family !== 6)) {
        throw new SecureResearchHttpError("dns_lookup_failed", "dns_lookup_invalid_family");
      }
      return rows.map((row) => ({ address: row.address, family: row.family as 4 | 6 }));
    } catch (error) {
      if (error instanceof SecureResearchHttpError) throw error;
      throw new SecureResearchHttpError(
        "dns_lookup_failed",
        "dns_lookup_failed",
        false,
        boundedResearchNetworkErrorCode(error),
      );
    }
  }
}

export async function resolvePinnedResearchAddress(input: {
  hostname: string;
  resolver: ResearchDnsResolver;
  timeoutMs?: number;
}): Promise<{ pinnedAddress: ResolvedResearchAddress; addresses: readonly ResolvedResearchAddress[]; durationMs: number }> {
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      input.resolver.resolve(input.hostname),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new SecureResearchHttpError("dns_timeout", "dns_lookup_timeout")), input.timeoutMs ?? RESEARCH_DNS_TIMEOUT_MS);
      }),
    ]);
    if (addresses.length === 0) throw new SecureResearchHttpError("dns_result_empty", "dns_result_empty");
    const unique = [...new Map(addresses.map((item) => [`${item.family}:${item.address}`, item])).values()];
    for (const address of unique) {
      const validated = validatePublicResearchAddress(address);
      if (!validated.ok) throw new SecureResearchHttpError("dns_security_rejected", `dns_address_${validated.reason}`);
    }
    unique.sort((left, right) => left.family - right.family || left.address.localeCompare(right.address));
    return { pinnedAddress: unique[0], addresses: unique, durationMs: Date.now() - startedAt };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
