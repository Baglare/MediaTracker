import { NextResponse } from "next/server";

import { loadSocialProfile } from "@/lib/social/server";

export async function GET(_request: Request, context: { params: Promise<{ username: string }> }) {
  const { username } = await context.params;
  return NextResponse.json(await loadSocialProfile(username));
}
