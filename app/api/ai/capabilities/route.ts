import { resolveAiEntitlement, toPublicAiEntitlement } from "@/lib/ai/entitlement";
import { noStoreJson } from "@/lib/api/request-security";

export async function GET(request: Request) {
  return noStoreJson(toPublicAiEntitlement(await resolveAiEntitlement(request)));
}
