import { runSafeApiRoute } from "@/lib/api/safe-route";
import { NextResponse } from "next/server";
import { buildPublicCloudRolloutState } from "@/lib/cloud-rollout";

export const dynamic = "force-dynamic";

export function GET() {
  return runSafeApiRoute("/api/cloud/rollout", "GET", async () => {
  return NextResponse.json(buildPublicCloudRolloutState(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });

  });
}
