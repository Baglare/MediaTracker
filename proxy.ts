import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { contentSecurityPolicy } from "@/lib/security/content-security-policy";

export function proxy(request: NextRequest) {
  // RSC/prefetch responses do not execute scripts. Keep them nonce-free. A
  // forged prefetch/Accept header on an HTML request receives script-src none,
  // rather than bypassing CSP through a matcher `missing` condition.
  const nonDocument = request.headers.has("next-router-prefetch")
    || request.headers.get("purpose") === "prefetch"
    || request.headers.get("accept")?.includes("text/x-component");
  const nonce = nonDocument ? undefined : randomBytes(32).toString("base64");
  const policy = contentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const requestHeaders = new Headers(request.headers);
  // Overwrite untrusted inbound CSP/nonces, including on nonce-free requests.
  requestHeaders.delete("x-nonce");
  requestHeaders.delete("content-security-policy-report-only");
  if (nonce) requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    // Exact asset namespaces, not a broad extension exclusion: usernames and
    // unknown document routes containing dots must still receive CSP.
    "/((?!api(?:/|$)|_next/|favicon.ico$|icon.png$|apple-icon.png$|brand/|placeholders/|(?:window|vercel|next|globe|file).svg$).*)",
  ],
};
