import { NextResponse } from "next/server";

import { loadSocialPersonSummary, searchSocialPeople } from "@/lib/social/server";
import { validateSearchQuery } from "@/lib/social/validation";
import { validateUuid } from "@/lib/social/interactions-validation";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/social/route-response";
import { SEARCH_REQUEST_MAX_BYTES, apiError, enforceRateLimit, readStrictJsonObject, resolveRateLimitIdentity } from "@/lib/api/request-security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idValue = url.searchParams.get("id");
  if (!idValue || [...url.searchParams.keys()].some((key) => key !== "id")) return apiError("people_id_invalid", 400);
  const id = validateUuid(idValue, "Alıcı");
  if (!id.ok) return apiError("people_id_invalid", 400);
  const person = await loadSocialPersonSummary(id.value);
  return NextResponse.json({ ok: true, person }, { status: person ? 200 : 404, headers: PRIVATE_NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const parsed = await readStrictJsonObject(request, new Set(["query", "offset"]), SEARCH_REQUEST_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const query = validateSearchQuery(parsed.value.query);
  if (!query.ok) return NextResponse.json({ ok: false, message: query.error, results: [] }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  const offset = parsed.value.offset === undefined ? 0 : parsed.value.offset;
  if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 10_000 || offset % 20 !== 0) {
    return apiError("people_offset_invalid", 400);
  }
  const rateLimit = enforceRateLimit("search:social-people", await resolveRateLimitIdentity(request), 60, 60_000);
  if (rateLimit) return rateLimit;
  return NextResponse.json({ ok: true, results: await searchSocialPeople(query.value, offset), offset }, { headers: PRIVATE_NO_STORE_HEADERS });
}
