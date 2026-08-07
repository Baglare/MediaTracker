import "server-only";

import { resolve4, resolve6 } from "node:dns/promises";
import { validatePublicResearchAddress } from "./ip-policy";
import type { ResearchDnsResolver, ResolvedResearchAddress } from "./types";
import { SecureResearchHttpError } from "./types";

export const RESEARCH_DNS_TIMEOUT_MS = 1_250;

export class NodeResearchDnsResolver implements ResearchDnsResolver {
  async resolve(hostname: string): Promise<readonly ResolvedResearchAddress[]> {
    const [ipv4, ipv6] = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
    return [
      ...(ipv4.status === "fulfilled" ? ipv4.value.map((address) => ({ address, family: 4 as const })) : []),
      ...(ipv6.status === "fulfilled" ? ipv6.value.map((address) => ({ address, family: 6 as const })) : []),
    ];
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
    if (addresses.length === 0) throw new SecureResearchHttpError("dns_unavailable", "dns_result_empty");
    const unique = [...new Map(addresses.map((item) => [`${item.family}:${item.address}`, item])).values()];
    for (const address of unique) {
      const validated = validatePublicResearchAddress(address);
      if (!validated.ok) throw new SecureResearchHttpError("security_rejected", `dns_address_${validated.reason}`);
    }
    unique.sort((left, right) => left.family - right.family || left.address.localeCompare(right.address));
    return { pinnedAddress: unique[0], addresses: unique, durationMs: Date.now() - startedAt };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

