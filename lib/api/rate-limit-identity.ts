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

/** No HTTP header can select the off-platform adapter. Production off Vercel fails closed. */
export function trustedRateLimitIp(request: Request): string | null {
  if (process.env.VERCEL === "1") return canonicalRateLimitIp(ipAddress(request));
  if (process.env.NODE_ENV !== "production" && process.env.RATE_LIMIT_LOCAL_TEST_IP) {
    return canonicalRateLimitIp(process.env.RATE_LIMIT_LOCAL_TEST_IP);
  }
  return null;
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
