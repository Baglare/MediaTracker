import { NextResponse } from "next/server";

import { searchSocialPeople } from "@/lib/social/server";
import { validateSearchQuery } from "@/lib/social/validation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = validateSearchQuery(url.searchParams.get("q"));
  if (!query.ok) return NextResponse.json({ ok: false, message: query.error, results: [] }, { status: 400 });
  const offsetValue = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(offsetValue) && offsetValue >= 0 ? offsetValue : 0;
  return NextResponse.json({ ok: true, results: await searchSocialPeople(query.value, offset), offset });
}
