import { noStoreJson } from "@/lib/api/request-security";
import { resolvePublicProviderCapabilities } from "@/lib/providers/release-policy";

export async function GET() {
  return noStoreJson(resolvePublicProviderCapabilities());
}
