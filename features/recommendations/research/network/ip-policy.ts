import type { ResolvedResearchAddress } from "./types";

export type ResearchIpRejectionReason =
  | "invalid_ip"
  | "unspecified"
  | "loopback"
  | "private"
  | "carrier_grade_nat"
  | "link_local"
  | "multicast"
  | "documentation"
  | "benchmark"
  | "reserved"
  | "unique_local"
  | "site_local"
  | "special_use";

export type ResearchIpPolicyResult =
  | { ok: true; address: ResolvedResearchAddress }
  | { ok: false; reason: ResearchIpRejectionReason };

function ipv4Number(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map(Number);
  if (bytes.some((part, index) => !Number.isInteger(part) || part < 0 || part > 255 || String(part) !== parts[index])) return null;
  return (((bytes[0] * 256 + bytes[1]) * 256 + bytes[2]) * 256 + bytes[3]) >>> 0;
}

function inV4Cidr(value: number, base: string, prefix: number): boolean {
  const baseValue = ipv4Number(base);
  if (baseValue === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

function validateIpv4(address: string): ResearchIpPolicyResult {
  const value = ipv4Number(address);
  if (value === null) return { ok: false, reason: "invalid_ip" };
  const checks: Array<[string, number, ResearchIpRejectionReason]> = [
    ["0.0.0.0", 8, "unspecified"], ["10.0.0.0", 8, "private"],
    ["100.64.0.0", 10, "carrier_grade_nat"], ["127.0.0.0", 8, "loopback"],
    ["169.254.0.0", 16, "link_local"], ["172.16.0.0", 12, "private"],
    ["192.0.0.0", 24, "special_use"], ["192.0.2.0", 24, "documentation"],
    ["192.88.99.0", 24, "special_use"], ["192.168.0.0", 16, "private"],
    ["198.18.0.0", 15, "benchmark"], ["198.51.100.0", 24, "documentation"],
    ["203.0.113.0", 24, "documentation"], ["224.0.0.0", 4, "multicast"],
    ["240.0.0.0", 4, "reserved"],
  ];
  for (const [base, prefix, reason] of checks) if (inV4Cidr(value, base, prefix)) return { ok: false, reason };
  return { ok: true, address: { address, family: 4 } };
}

function expandIpv6(input: string): number[] | null {
  let value = input.toLowerCase();
  const zoneIndex = value.indexOf("%");
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex);
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const mapped = ipv4Number(value.slice(lastColon + 1));
    if (mapped === null) return null;
    value = `${value.slice(0, lastColon)}:${((mapped >>> 16) & 0xffff).toString(16)}:${(mapped & 0xffff).toString(16)}`;
  }
  if ((value.match(/::/g) ?? []).length > 1) return null;
  const [leftRaw, rightRaw] = value.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((value.includes("::") && missing < 1) || (!value.includes("::") && missing !== 0)) return null;
  const groups = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return groups.map((part) => Number.parseInt(part, 16));
}

function ipv6Prefix(groups: readonly number[], prefixGroups: readonly number[], prefixBits: number): boolean {
  const full = Math.floor(prefixBits / 16);
  const remainder = prefixBits % 16;
  for (let index = 0; index < full; index += 1) if (groups[index] !== prefixGroups[index]) return false;
  if (remainder === 0) return true;
  const mask = (0xffff << (16 - remainder)) & 0xffff;
  return (groups[full] & mask) === (prefixGroups[full] & mask);
}

function prefixGroups(value: string): number[] {
  return expandIpv6(value) ?? [];
}

function validateIpv6(address: string): ResearchIpPolicyResult {
  const groups = expandIpv6(address);
  if (!groups) return { ok: false, reason: "invalid_ip" };
  if (ipv6Prefix(groups, prefixGroups("::ffff:0:0"), 96)) {
    const mapped = `${groups[6] >>> 8}.${groups[6] & 255}.${groups[7] >>> 8}.${groups[7] & 255}`;
    const result = validateIpv4(mapped);
    return result.ok ? { ok: true, address: { address, family: 6 } } : result;
  }
  const checks: Array<[string, number, ResearchIpRejectionReason]> = [
    ["::", 128, "unspecified"], ["::1", 128, "loopback"], ["::", 96, "special_use"],
    ["64:ff9b::", 96, "special_use"], ["100::", 64, "special_use"],
    ["2001::", 32, "special_use"], ["2001:2::", 48, "benchmark"],
    ["2001:10::", 28, "special_use"], ["2001:db8::", 32, "documentation"],
    ["2002::", 16, "special_use"], ["fc00::", 7, "unique_local"],
    ["fe80::", 10, "link_local"], ["fec0::", 10, "site_local"], ["ff00::", 8, "multicast"],
  ];
  for (const [base, bits, reason] of checks) if (ipv6Prefix(groups, prefixGroups(base), bits)) return { ok: false, reason };
  return { ok: true, address: { address, family: 6 } };
}

export function validatePublicResearchAddress(address: ResolvedResearchAddress): ResearchIpPolicyResult {
  return address.family === 4 ? validateIpv4(address.address) : validateIpv6(address.address);
}

