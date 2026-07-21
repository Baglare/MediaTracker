import { NextResponse } from "next/server";

import { loadSocialProfile } from "@/lib/social/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  return NextResponse.json(await loadSocialProfile(username), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
