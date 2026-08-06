import "server-only";

import { evaluateAnnotationToolAccess } from "../access";

export const ANNOTATION_PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
} as const;

export function annotationToolAccessForHost(host: string | null | undefined) {
  return evaluateAnnotationToolAccess({
    nodeEnv: process.env.NODE_ENV,
    enabledFlag: process.env.D7_ANNOTATION_TOOL_ENABLED,
    host,
  });
}

export function annotationApiGuard(request: Request): Response | null {
  const decision = annotationToolAccessForHost(request.headers.get("host"));
  if (decision.allowed) return null;
  return new Response(JSON.stringify({ error: "not_found" }), {
    status: 404,
    headers: ANNOTATION_PRIVATE_HEADERS,
  });
}

export function annotationJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: ANNOTATION_PRIVATE_HEADERS });
}
