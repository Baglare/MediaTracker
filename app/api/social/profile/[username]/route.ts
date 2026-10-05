import { enforceDistributedRateLimit } from "@/lib/api/distributed-rate-limit";
import { runSafeApiRoute } from "@/lib/api/safe-route";
import { NextResponse } from "next/server";

import { loadSocialProfile } from "@/lib/social/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: { params: Promise<{ username: string }> }) {
  return runSafeApiRoute("/api/social/profile/[username]", "GET", async () => {
  const rateLimit = await enforceDistributedRateLimit(request, "social_read");
  if (rateLimit) return rateLimit;
  const { username } = await context.params;
  return NextResponse.json(await loadSocialProfile(username), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });

  });
}
