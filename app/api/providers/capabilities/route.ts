import { runSafeApiRoute } from "@/lib/api/safe-route";
import { noStoreJson } from "@/lib/api/request-security";
import { resolvePublicProviderCapabilities } from "@/lib/providers/release-policy";

export async function GET() {
  return runSafeApiRoute("/api/providers/capabilities", "GET", async () => {
  return noStoreJson(resolvePublicProviderCapabilities());

  });
}
