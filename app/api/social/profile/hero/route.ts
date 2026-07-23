import { NextResponse } from "next/server";

import { loadOwnProfileHeroData } from "@/lib/social/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return NextResponse.json(await loadOwnProfileHeroData(), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
