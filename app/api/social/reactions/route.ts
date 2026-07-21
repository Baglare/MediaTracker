import { PRIVATE_NO_STORE_HEADERS, readJsonBody, safeSocialRouteError } from "@/lib/social/route-response";
import { socialRecord, validateReactionType, validateUuid } from "@/lib/social/interactions-validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";export const revalidate=0;

export async function POST(request:Request){
  const body=socialRecord(await readJsonBody(request));const reaction=validateReactionType(body?.reaction);const activity=body?.activityId?validateUuid(body.activityId):null;const comment=body?.commentId?validateUuid(body.commentId):null;
  if(!body||!reaction.ok||(activity&&!activity.ok)||(comment&&!comment.ok)||Number(Boolean(activity))+Number(Boolean(comment))!==1)return Response.json({message:!reaction.ok?reaction.error:"Tepki hedefi geçersiz."},{status:400,headers:PRIVATE_NO_STORE_HEADERS});
  try{const client=await getSupabaseServerClient();if(!client)throw new Error("social_not_configured");const {data,error}=await client.rpc("social_react",{p_activity:activity?.ok?activity.value:null,p_comment:comment?.ok?comment.value:null,p_reaction:reaction.value});if(error)throw new Error(error.message);return Response.json(data,{headers:PRIVATE_NO_STORE_HEADERS});}catch(error){return safeSocialRouteError(error);}
}
