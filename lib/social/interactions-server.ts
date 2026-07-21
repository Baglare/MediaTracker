import "server-only";

import { createSignedSocialAssetUrl } from "@/lib/social/server";
import {
  DEFAULT_ACTIVITY_PREFERENCES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type CursorPage,
  type SocialActivity,
  type SocialActivityComment,
  type SocialEntityActor,
  type SocialNotification,
  type SocialPreferences,
  type SocialRecommendation,
  type SocialRecommendationDetail,
  type SocialRecommendationEvent,
  type SocialRecommendationMessage,
} from "@/lib/social/interactions";
import { parseRecommendationEvent, parseSocialRecommendation } from "@/lib/social/recommendation-parser";
import {
  socialRecord,
  validateActivityPreferences,
  validateActivityType,
  validateActivityVisibility,
  validateNotificationPreferences,
  validateNotificationType,
  validateReactionType,
  validateRecommendationPermission,
  validateSocialMediaSnapshot,
  validateUuid,
} from "@/lib/social/interactions-validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function numberValue(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function dateValue(value: unknown): string | undefined { const text=stringValue(value); return text && !Number.isNaN(Date.parse(text)) ? text : undefined; }

async function actorOf(value: unknown): Promise<SocialEntityActor | undefined> {
  const record=socialRecord(value); const id=validateUuid(record?.id); const displayName=stringValue(record?.displayName);
  if (!record || !id.ok || !displayName) return undefined;
  return { id:id.value, username:stringValue(record.username), displayName, avatarUrl:await createSignedSocialAssetUrl(record.avatarPath) };
}

async function commentOf(value: unknown): Promise<SocialActivityComment | undefined> {
  const record=socialRecord(value); const id=validateUuid(record?.id); const author=await actorOf(record?.author); const createdAt=dateValue(record?.createdAt); const updatedAt=dateValue(record?.updatedAt);
  if (!record || !id.ok || !author || !createdAt || !updatedAt || typeof record.spoiler!=="boolean" || typeof record.deleted!=="boolean") return undefined;
  const parent=record.parentCommentId===null || record.parentCommentId===undefined ? undefined : validateUuid(record.parentCommentId);
  if (parent && !parent.ok) return undefined;
  const body=record.deleted ? undefined : stringValue(record.body);
  const reactionsRecord=socialRecord(record.reactions)??{};const reactions:SocialActivityComment["reactions"]={};for(const [key,count] of Object.entries(reactionsRecord)){const reaction=validateReactionType(key);if(reaction.ok&&typeof count==="number"&&count>=0)reactions[reaction.value]=count;}const viewerReaction=record.viewerReaction?validateReactionType(record.viewerReaction):null;
  return { id:id.value,parentCommentId:parent?.ok?parent.value:undefined,body,spoiler:record.spoiler,deleted:record.deleted,createdAt,updatedAt,author,reactions,viewerReaction:viewerReaction?.ok?viewerReaction.value:undefined };
}

async function activityOf(value: unknown): Promise<SocialActivity | undefined> {
  const record=socialRecord(value); const id=validateUuid(record?.id); const eventType=validateActivityType(record?.eventType); const visibility=validateActivityVisibility(record?.visibility); const media=validateSocialMediaSnapshot(record?.media); const actor=await actorOf(record?.actor); const createdAt=dateValue(record?.createdAt); const updatedAt=dateValue(record?.updatedAt);
  if (!record || !id.ok || !eventType.ok || !visibility.ok || !media.ok || !actor || !createdAt || !updatedAt) return undefined;
  const comments=(await Promise.all((Array.isArray(record.comments)?record.comments:[]).map(commentOf))).filter((item):item is SocialActivityComment=>Boolean(item));
  const reactionsRecord=socialRecord(record.reactions)??{}; const reactions:SocialActivity["reactions"]={};
  for(const [key,count] of Object.entries(reactionsRecord)){const reaction=validateReactionType(key);if(reaction.ok&&typeof count==="number"&&count>=0)reactions[reaction.value]=count;}
  const viewerReaction=record.viewerReaction ? validateReactionType(record.viewerReaction) : null;
  return {id:id.value,eventType:eventType.value,visibility:visibility.value,media:media.value,rating:numberValue(record.rating),text:stringValue(record.text),createdAt,updatedAt,actor,comments,reactions,viewerReaction:viewerReaction?.ok?viewerReaction.value:undefined,commentCount:numberValue(record.commentCount)??comments.filter((item)=>!item.deleted).length};
}

function cursorOf(value: unknown): CursorPage<never>["nextCursor"] {
  const record=socialRecord(value); const id=validateUuid(record?.id); const createdAt=dateValue(record?.createdAt);
  return record&&id.ok&&createdAt?{id:id.value,createdAt}:undefined;
}

export async function loadSocialFeed(cursor?:{createdAt?:string;id?:string;limit?:number}):Promise<CursorPage<SocialActivity>>{
  const client=await getSupabaseServerClient(); if(!client) throw new Error("social_not_configured");
  const {data,error}=await client.rpc("list_social_feed",{p_cursor_created_at:cursor?.createdAt,p_cursor_id:cursor?.id,p_limit:cursor?.limit??20});
  if(error) throw new Error(error.message);
  const root=socialRecord(data); const items=(await Promise.all((Array.isArray(root?.items)?root.items:[]).map(activityOf))).filter((item):item is SocialActivity=>Boolean(item));
  return {items,nextCursor:cursorOf(root?.nextCursor)};
}

async function recommendationMessageOf(value:unknown):Promise<SocialRecommendationMessage|undefined>{
  const record=socialRecord(value);const id=validateUuid(record?.id);const createdAt=dateValue(record?.createdAt);const author=await actorOf(record?.author);
  if(!record||!id.ok||!createdAt||!author||typeof record.deleted!=="boolean")return undefined;
  return{id:id.value,body:record.deleted?undefined:stringValue(record.body),deleted:record.deleted,createdAt,author};
}

export async function loadSocialRecommendations(options:{box:string;status:string;createdAt?:string;id?:string;limit?:number}):Promise<CursorPage<SocialRecommendation>>{
  const client=await getSupabaseServerClient();if(!client)throw new Error("social_not_configured");
  const {data,error}=await client.rpc("list_social_recommendations",{p_box:options.box,p_status:options.status,p_cursor_created_at:options.createdAt,p_cursor_id:options.id,p_limit:options.limit??20});if(error)throw new Error(error.message);
  const root=socialRecord(data);const parsed=await Promise.all((Array.isArray(root?.items)?root.items:[]).map((item)=>parseSocialRecommendation(item,createSignedSocialAssetUrl)));const skipped=parsed.filter((item)=>!item.ok);if(skipped.length>0)console.warn("social_recommendation_parse_skipped",{count:skipped.length,reasons:[...new Set(skipped.map((item)=>item.reason))]});const items=parsed.flatMap((item)=>item.ok?[item.value]:[]);return{items,nextCursor:cursorOf(root?.nextCursor)};
}

export async function loadSocialRecommendationDetail(recommendationId:string):Promise<SocialRecommendationDetail>{
  const client=await getSupabaseServerClient();if(!client)throw new Error("social_not_configured");
  const {data,error}=await client.rpc("get_social_recommendation_detail",{p_recommendation:recommendationId});if(error)throw new Error(error.message);
  const root=socialRecord(data);if(!root)throw new Error("recommendation_unavailable");
  const events=(Array.isArray(root.events)?root.events:[]).map(parseRecommendationEvent).filter((item):item is SocialRecommendationEvent=>Boolean(item));
  const messages=(await Promise.all((Array.isArray(root.messages)?root.messages:[]).map(recommendationMessageOf))).filter((item):item is SocialRecommendationMessage=>Boolean(item));
  return{events,messages,threadOpen:root.threadOpen===true};
}

async function notificationOf(value:unknown):Promise<SocialNotification|undefined>{
  const record=socialRecord(value);const id=validateUuid(record?.id);const type=validateNotificationType(record?.type);const createdAt=dateValue(record?.createdAt);const entityId=record?.entityId?validateUuid(record.entityId):null;const actor=record?.actor?await actorOf(record.actor):undefined;const entityType=record?.entityType;
  if(!record||!id.ok||!type.ok||!createdAt||!(["profile","activity","comment","recommendation"] as const).includes(entityType as SocialNotification["entityType"])||(entityId&&!entityId.ok))return undefined;
  const rawPayload=socialRecord(record.payload)??{};const payload:SocialNotification["payload"]={};for(const [key,item] of Object.entries(rawPayload)){if(typeof item==="string"||typeof item==="number"||typeof item==="boolean"||item===null)payload[key]=item;}
  return{id:id.value,type:type.value,entityType:entityType as SocialNotification["entityType"],entityId:entityId?.ok?entityId.value:undefined,payload,createdAt,readAt:dateValue(record.readAt),actor};
}

export async function loadSocialNotifications(cursor?:{createdAt?:string;id?:string;limit?:number}):Promise<CursorPage<SocialNotification>&{unreadCount:number}>{
  const client=await getSupabaseServerClient();if(!client)throw new Error("social_not_configured");const {data,error}=await client.rpc("list_social_notifications",{p_cursor_created_at:cursor?.createdAt,p_cursor_id:cursor?.id,p_limit:cursor?.limit??30});if(error)throw new Error(error.message);
  const root=socialRecord(data);const items=(await Promise.all((Array.isArray(root?.items)?root.items:[]).map(notificationOf))).filter((item):item is SocialNotification=>Boolean(item));return{items,unreadCount:numberValue(root?.unreadCount)??0,nextCursor:cursorOf(root?.nextCursor)};
}

export async function loadSocialPreferences():Promise<SocialPreferences>{
  const client=await getSupabaseServerClient();if(!client)return{configured:false,recommendationPermission:"mutual",activity:DEFAULT_ACTIVITY_PREFERENCES,notifications:DEFAULT_NOTIFICATION_PREFERENCES};
  const {data,error}=await client.rpc("social_get_preferences",{});if(error)throw new Error(error.message);const root=socialRecord(data);const permission=validateRecommendationPermission(root?.recommendationPermission??"mutual");const activity=validateActivityPreferences(root?.activity??DEFAULT_ACTIVITY_PREFERENCES);const notifications=validateNotificationPreferences(root?.notifications??DEFAULT_NOTIFICATION_PREFERENCES);
  return{configured:root?.configured===true,recommendationPermission:permission.ok?permission.value:"mutual",activity:activity.ok?activity.value:DEFAULT_ACTIVITY_PREFERENCES,notifications:notifications.ok?notifications.value:DEFAULT_NOTIFICATION_PREFERENCES};
}
