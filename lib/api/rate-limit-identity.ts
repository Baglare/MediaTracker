import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { ipAddress } from "@vercel/functions";

/** Node's address validator plus WHATWG IPv6 normalization; guests share a /64. */
export function canonicalRateLimitIp(input: string | undefined): string | null {
  if (!input || input.length > 64 || input !== input.trim() || /[%\s,\[\]]/.test(input)) return null;
  const family = isIP(input);
  if (family === 4) return input;
  if (family !== 6) return null;
  const normalized = new URL(`http://[${input}]/`).hostname.slice(1, -1);
  const [head, tail] = normalized.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const words = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  const numbers = words.map((word) => Number.parseInt(word, 16));
  if (numbers.slice(0, 5).every((word) => word === 0) && numbers[5] === 0xffff) {
    return [numbers[6] >> 8, numbers[6] & 255, numbers[7] >> 8, numbers[7] & 255].join(".");
  }
  return `${numbers.slice(0, 4).map((word) => word.toString(16).padStart(4, "0")).join(":")}::/64`;
}

export type TrustedIngressIdentity = {
  platform: 'local-test' | 'vercel' | 'passenger' | 'unconfigured';
  status: 'trusted' | 'unavailable';
  ip: string | null;
};
/** Platform selection is server configuration, never an HTTP override.
 * Passenger headers remain untrusted until the P4 proxy contract is proven. */
export function resolveTrustedIngress(request: Request,
  env: Record<string, string | undefined> = process.env): TrustedIngressIdentity {
  const mode = env.TRUSTED_INGRESS_MODE;
  let platform: TrustedIngressIdentity['platform'] = 'unconfigured';
  let ip: string | null = null;
  if (mode === 'vercel' || (mode === undefined && env.BACKEND_PROVIDER !== 'native' && env.VERCEL === '1')) {
    platform = 'vercel';
    if (env.VERCEL === '1') ip = canonicalRateLimitIp(ipAddress(request));
  } else if (mode === 'passenger') {
    platform = 'passenger'; // No assumed x-forwarded-for/x-real-ip contract.
  } else if (mode === 'local-test' || (mode === undefined && env.RATE_LIMIT_LOCAL_TEST_IP)) {
    platform = 'local-test';
    if (env.NODE_ENV !== 'production') ip = canonicalRateLimitIp(env.RATE_LIMIT_LOCAL_TEST_IP);
  }
  return { platform, status: ip ? 'trusted' : 'unavailable', ip };
}
export function trustedRateLimitIp(request: Request): string | null {
  return resolveTrustedIngress(request).ip;
}

export type LimiterIdentity = { kind: "user" | "ip"; value: string };
export function subjectDigest(key: string, audience: string, scope: string, epoch: number, identity: LimiterIdentity): string {
  return createHmac("sha256", key).update(JSON.stringify([1, audience, identity.kind, scope, epoch, identity.value])).digest("hex");
}

export function identityEpochs(now: number): number[] {
  const seconds = Math.floor(now / 1000);
  const day = Math.floor(seconds / 86_400);
  return seconds % 86_400 < 60 ? [day - 1, day] : [day];
}
