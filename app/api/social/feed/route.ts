import { loadSocialFeed } from "@/lib/social/interactions-server";
import { PRIVATE_NO_STORE_HEADERS, readJsonBody, safeSocialRouteError } from "@/lib/social/route-response";
import { socialRecord, safeSocialText, validateActivityType, validateActivityVisibility, validateCursor, validateSocialMediaSnapshot, validateUuid } from "@/lib/social/interactions-validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const dynamic="force-dynamic";export const revalidate=0;

export async function GET(request:Request){
  const cursor=validateCursor(new URL(request.url).searchParams);if(!cursor.ok)return Response.json({message:cursor.error},{status:400,headers:PRIVATE_NO_STORE_HEADERS});
  try{return Response.json(await loadSocialFeed(cursor.value),{headers:PRIVATE_NO_STORE_HEADERS});}catch(error){return safeSocialRouteError(error);}
}

export async function POST(request:Request){
  const body=socialRecord(await readJsonBody(request));if(!body)return Response.json({message:"Aktivite verisi geçersiz."},{status:400,headers:PRIVATE_NO_STORE_HEADERS});
  try{
    const client=await getSupabaseServerClient();if(!client)throw new Error("social_not_configured");
    if(body.action==="delete"){const id=validateUuid(body.activityId,"Aktivite kimliği");if(!id.ok)return Response.json({message:id.error},{status:400,headers:PRIVATE_NO_STORE_HEADERS});const {error}=await client.rpc("social_delete_activity",{p_activity:id.value});if(error)throw new Error(error.message);return Response.json({ok:true},{headers:PRIVATE_NO_STORE_HEADERS});}
    if(body.action!=="publish")return Response.json({message:"Aktivite aksiyonu geçersiz."},{status:400,headers:PRIVATE_NO_STORE_HEADERS});
    const type=validateActivityType(body.eventType);const visibility=validateActivityVisibility(body.visibility);const media=validateSocialMediaSnapshot(body.media);const source=safeSocialText(body.sourceEventId,180,true);const dedupe=safeSocialText(body.dedupeKey,220,true);const text=safeSocialText(body.text,500);
    if(!type.ok||!visibility.ok||!media.ok||!source.ok||!source.value||!dedupe.ok||!dedupe.value||!text.ok)return Response.json({message:!type.ok?type.error:!visibility.ok?visibility.error:!media.ok?media.error:!source.ok?source.error:!dedupe.ok?dedupe.error:text.ok?"Aktivite geçersiz.":text.error},{status:400,headers:PRIVATE_NO_STORE_HEADERS});
    const rating=body.rating===undefined||body.rating===null?null:body.rating;if(rating!==null&&(!Number.isInteger(rating)||Number(rating)<0||Number(rating)>10))return Response.json({message:"Puan geçersiz."},{status:400,headers:PRIVATE_NO_STORE_HEADERS});
    const {data,error}=await client.rpc("social_publish_activity",{p_event_type:type.value,p_visibility:visibility.value,p_media:media.value as unknown as Json,p_rating:rating as number|null,p_short_text:text.value??null,p_source_event_id:source.value,p_dedupe_key:dedupe.value});if(error)throw new Error(error.message);return Response.json(data,{headers:PRIVATE_NO_STORE_HEADERS});
  }catch(error){return safeSocialRouteError(error);}
}
