import { PRIVATE_NO_STORE_HEADERS, readJsonBody, safeSocialRouteError } from "@/lib/social/route-response";
import { safeSocialText, socialRecord, validateUuid } from "@/lib/social/interactions-validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";export const revalidate=0;

export async function POST(request:Request){
  const body=socialRecord(await readJsonBody(request));const activity=validateUuid(body?.activityId,"Aktivite kimliği");const parent=body?.parentCommentId?validateUuid(body.parentCommentId,"Yorum kimliği"):null;const text=safeSocialText(body?.body,1000,true);const dedupe=safeSocialText(body?.dedupeKey,220,true);
  if(!body||!activity.ok||(parent&&!parent.ok)||!text.ok||!text.value||!dedupe.ok||!dedupe.value||typeof body.spoiler!=="boolean")return Response.json({message:!activity.ok?activity.error:parent&&!parent.ok?parent.error:!text.ok?text.error:!dedupe.ok?dedupe.error:"Yorum verisi geçersiz."},{status:400,headers:PRIVATE_NO_STORE_HEADERS});
  try{const client=await getSupabaseServerClient();if(!client)throw new Error("social_not_configured");const {data,error}=await client.rpc("social_comment",{p_activity:activity.value,p_parent:parent?.ok?parent.value:null,p_body:text.value,p_spoiler:body.spoiler,p_dedupe_key:dedupe.value});if(error)throw new Error(error.message);return Response.json(data,{headers:PRIVATE_NO_STORE_HEADERS});}catch(error){return safeSocialRouteError(error);}
}

export async function PATCH(request:Request){
  const body=socialRecord(await readJsonBody(request));const comment=validateUuid(body?.commentId,"Yorum kimliği");if(!body||!comment.ok||!["edit","delete","hide"].includes(String(body.action)))return Response.json({message:comment.ok?"Yorum aksiyonu geçersiz.":comment.error},{status:400,headers:PRIVATE_NO_STORE_HEADERS});
  const text=body.action==="edit"?safeSocialText(body.body,1000,true):{ok:true as const,value:undefined};if(!text.ok||body.action==="edit"&&typeof body.spoiler!=="boolean")return Response.json({message:text.ok?"Spoiler değeri geçersiz.":text.error},{status:400,headers:PRIVATE_NO_STORE_HEADERS});
  try{const client=await getSupabaseServerClient();if(!client)throw new Error("social_not_configured");const {data,error}=await client.rpc("social_comment_action",{p_action:String(body.action),p_comment:comment.value,p_body:text.value??null,p_spoiler:body.spoiler===true});if(error)throw new Error(error.message);return Response.json(data,{headers:PRIVATE_NO_STORE_HEADERS});}catch(error){return safeSocialRouteError(error);}
}
