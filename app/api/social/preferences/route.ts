import { enforceDistributedRateLimit } from "@/lib/api/distributed-rate-limit";
import { supabaseApplicationError } from "@/lib/supabase/safe-error";
import { runSafeApiRoute } from "@/lib/api/safe-route";
import { validateAuthenticatedMutationRequest } from "@/lib/api/request-security";
import { loadSocialPreferences } from "@/lib/social/interactions-server";
import { PRIVATE_NO_STORE_HEADERS, readJsonBody, safeSocialRouteError } from "@/lib/social/route-response";
import { socialRecord, validateActivityPreferences, validateNotificationPreferences, validateRecommendationPermission } from "@/lib/social/interactions-validation";
import { getApplicationServerClient as getSupabaseServerClient } from "@/lib/backend/application-server";
import type { Json } from "@/lib/supabase/types";

export const dynamic="force-dynamic";export const revalidate=0;
export async function GET(request: Request = new Request("http://localhost")){
  return runSafeApiRoute("/api/social/preferences", "GET", async () => {
  const rateLimit = await enforceDistributedRateLimit(request, "social_read");
  if (rateLimit) return rateLimit;try{return Response.json(await loadSocialPreferences(),{headers:PRIVATE_NO_STORE_HEADERS});}catch(error){return safeSocialRouteError(error);}
  });
}
export async function POST(request:Request){
  return runSafeApiRoute("/api/social/preferences", "POST", async () => {
  const boundaryError = validateAuthenticatedMutationRequest(request);
  if (boundaryError) return boundaryError;
  const rateLimit = await enforceDistributedRateLimit(request, "social_write");
  if (rateLimit) return rateLimit;
const body=socialRecord(await readJsonBody(request));const kind=String(body?.kind??"");let values:unknown;if(kind==="activity"){const result=validateActivityPreferences(body?.values);if(!result.ok)return Response.json({message:result.error},{status:400,headers:PRIVATE_NO_STORE_HEADERS});values=result.value;}else if(kind==="notifications"){const result=validateNotificationPreferences(body?.values);if(!result.ok)return Response.json({message:result.error},{status:400,headers:PRIVATE_NO_STORE_HEADERS});values=result.value;}else if(kind==="recommendations"){const record=socialRecord(body?.values);const result=validateRecommendationPermission(record?.permission);if(!result.ok)return Response.json({message:result.error},{status:400,headers:PRIVATE_NO_STORE_HEADERS});values={permission:result.value};}else return Response.json({message:"Tercih grubu geçersiz."},{status:400,headers:PRIVATE_NO_STORE_HEADERS});try{const client=await getSupabaseServerClient();if(!client)throw new Error("social_not_configured");const {data,error}=await client.rpc("social_save_preferences",{p_kind:kind,p_values:values as Json});if(error)throw supabaseApplicationError(error);return Response.json(data,{headers:PRIVATE_NO_STORE_HEADERS});}catch(error){return safeSocialRouteError(error);}
  });
}
