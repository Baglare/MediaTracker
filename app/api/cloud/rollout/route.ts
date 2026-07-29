import { NextResponse } from "next/server";
import { buildPublicCloudRolloutState } from "@/lib/cloud-rollout";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildPublicCloudRolloutState(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
