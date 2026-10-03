import { runSafeApiRoute } from "@/lib/api/safe-route";
import { resolveAiEntitlement, toPublicAiEntitlement } from "@/lib/ai/entitlement";
import { noStoreJson } from "@/lib/api/request-security";

export async function GET(request: Request) {
  return runSafeApiRoute("/api/ai/capabilities", "GET", async () => {
  return noStoreJson(toPublicAiEntitlement(await resolveAiEntitlement(request)));

  });
}
