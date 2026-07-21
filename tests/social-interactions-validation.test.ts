import { describe,expect,it } from "vitest";
import { safeSocialText,validateActivityPreferences,validateActivityType,validateCursor,validateNotificationPreferences,validateReactionType,validateRecommendationPermission,validateRecommendationProgressStatus,validateRecommendationResponseStatus,validateReportCategory,validateSocialMediaSnapshot } from "@/lib/social/interactions-validation";

const media={title:"Dune",mediaType:"book",canonicalKey:"openlibrary:/works/OL1W",externalSource:"openlibrary",externalId:"/works/OL1W",coverUrl:"https://example.com/dune.jpg",overview:"A safe summary",world:"arch"};

describe("social runtime validation",()=>{
  it.each(["media_started","media_completed","rating_shared","favorite_shared","shared_note_published","recommendation_completed","manual_media_share"])("accepts activity type %s",(value)=>expect(validateActivityType(value).ok).toBe(true));
  it("rejects unknown activity and reaction types",()=>{expect(validateActivityType("progress_increment").ok).toBe(false);expect(validateReactionType("fire").ok).toBe(false);});
  it.each(["like","love","interesting","celebrate"])("accepts reaction %s",(value)=>expect(validateReactionType(value).ok).toBe(true));
  it("accepts a structured media snapshot",()=>expect(validateSocialMediaSnapshot(media)).toEqual({ok:true,value:media}));
  it("rejects unsafe or incomplete media snapshots",()=>{expect(validateSocialMediaSnapshot({...media,coverUrl:"http://example.com/x"}).ok).toBe(false);expect(validateSocialMediaSnapshot({...media,canonicalKey:""}).ok).toBe(false);expect(validateSocialMediaSnapshot({...media,title:"<b>Dune</b>"}).ok).toBe(false);});
  it("enforces comment and note plain-text limits",()=>{expect(safeSocialText("hello",1000,true).ok).toBe(true);expect(safeSocialText("",1000,true).ok).toBe(false);expect(safeSocialText("<img>",1000,true).ok).toBe(false);expect(safeSocialText("x".repeat(1001),1000,true).ok).toBe(false);});
  it.each(["mutual","following","followers","everyone","none"])("accepts recommendation permission %s",(value)=>expect(validateRecommendationPermission(value).ok).toBe(true));
  it("rejects unsupported recommendation permissions",()=>expect(validateRecommendationPermission("friends").ok).toBe(false));
  it("validates recommendation response and progress status values",()=>{expect(validateRecommendationResponseStatus("accepted").ok).toBe(true);expect(validateRecommendationProgressStatus("completed").ok).toBe(true);expect(validateRecommendationResponseStatus("done").ok).toBe(false);expect(validateRecommendationProgressStatus("watching").ok).toBe(false);});
  it.each(["spam","harassment","spoiler","inappropriate","other"])("accepts report category %s",(value)=>expect(validateReportCategory(value).ok).toBe(true));
  it("applies safe activity preference defaults",()=>expect(validateActivityPreferences({})).toMatchObject({ok:true,value:{shareCompleted:true,shareStarted:false,defaultVisibility:"followers"}}));
  it("keeps rejected recommendation notifications disabled by default",()=>expect(validateNotificationPreferences({})).toMatchObject({ok:true,value:{recommendationRejected:false,recommendationReceived:true}}));
  it("validates cursor date, uuid and limit together",()=>{const good=new URLSearchParams({cursorCreatedAt:"2026-07-21T12:00:00.000Z",cursorId:"00000000-0000-4000-8000-000000000001",limit:"20"});expect(validateCursor(good).ok).toBe(true);expect(validateCursor(new URLSearchParams({limit:"500"})).ok).toBe(false);expect(validateCursor(new URLSearchParams({cursorId:"bad"})).ok).toBe(false);});
});
