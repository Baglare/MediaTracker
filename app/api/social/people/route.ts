import { NextResponse } from "next/server";

import { loadSocialPersonSummary, searchSocialPeople } from "@/lib/social/server";
import { validateSearchQuery } from "@/lib/social/validation";
import { validateUuid } from "@/lib/social/interactions-validation";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/social/route-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const idValue = url.searchParams.get("id");
  if (idValue) {
    const id = validateUuid(idValue, "Alıcı");
    if (!id.ok) return NextResponse.json({ ok: false, message: id.error }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    const person = await loadSocialPersonSummary(id.value);
    return NextResponse.json({ ok: true, person }, { status: person ? 200 : 404, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const query = validateSearchQuery(url.searchParams.get("q"));
  if (!query.ok) return NextResponse.json({ ok: false, message: query.error, results: [] }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  const offsetValue = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(offsetValue) && offsetValue >= 0 ? offsetValue : 0;
  return NextResponse.json({ ok: true, results: await searchSocialPeople(query.value, offset), offset }, { headers: PRIVATE_NO_STORE_HEADERS });
}
