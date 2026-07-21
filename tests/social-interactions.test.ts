import { describe,expect,it } from "vitest";
import { canonicalMediaKey,deriveActivityEvents,isRecommendationTransitionAllowed,mediaToSocialSnapshot,notificationHref,type ActivityPreferences } from "@/lib/social/interactions";
import type { MediaItem } from "@/lib/types";

const preferences:ActivityPreferences={shareCompleted:true,shareStarted:true,shareRating:true,shareFavorite:true,shareRecommendationCompleted:false,defaultVisibility:"followers"};
const base:MediaItem={id:"local-1",title:"Frieren",type:"anime",status:"planning",coverImage:"data:image/png;base64,private",currentProgress:0,totalProgress:28,userRating:null,favorite:false,externalSource:"anilist",externalId:"154587",overview:"Safe overview",personalNotes:"private note",tags:["private tag"]};

describe("social interaction domain",()=>{
  it("uses external source and id as the stable canonical key",()=>expect(canonicalMediaKey(base)).toBe("anilist:154587"));
  it("uses a deterministic cross-device local fallback key when no external id exists",()=>expect(canonicalMediaKey({...base,externalSource:undefined,externalId:undefined})).toBe("local:anime:frieren"));
  it("builds a minimal snapshot without local-only notes or data urls",()=>{const snapshot=mediaToSocialSnapshot(base);expect(snapshot).toMatchObject({title:"Frieren",mediaType:"anime",world:"east",canonicalKey:"anilist:154587"});expect(snapshot.coverUrl).toBeUndefined();expect(JSON.stringify(snapshot)).not.toContain("private note");expect(JSON.stringify(snapshot)).not.toContain("private tag");});
  it("emits started only for a real status transition",()=>expect(deriveActivityEvents(base,{...base,status:"watching"},preferences)).toEqual(["media_started"]));
  it("does not emit an activity for a plain progress increment",()=>expect(deriveActivityEvents({...base,status:"watching",currentProgress:1},{...base,status:"watching",currentProgress:2},preferences)).toEqual([]));
  it("emits completed once on the completed transition",()=>expect(deriveActivityEvents({...base,status:"watching"},{...base,status:"completed",currentProgress:28},preferences)).toEqual(["media_completed"]));
  it("does not emit completed when the preference is disabled",()=>expect(deriveActivityEvents({...base,status:"watching"},{...base,status:"completed"},{...preferences,shareCompleted:false})).toEqual([]));
  it("emits rating and favorite events only on changed positive values",()=>expect(deriveActivityEvents(base,{...base,userRating:9,favorite:true},preferences)).toEqual(["rating_shared","favorite_shared"]));
  it.each([
    ["pending","none","accept",true],["deferred","none","accept",true],["accepted","none","withdraw",false],["accepted","none","linked",true],["accepted","linked","started",true],["accepted","started","completed",true],["rejected","none","accept",false],
  ] as const)("validates %s/%s -> %s",(response,progress,action,expected)=>expect(isRecommendationTransitionAllowed(response,progress,action)).toBe(expected));
  it("builds safe notification destinations",()=>{expect(notificationHref({entityType:"recommendation",entityId:"id"})).toBe("/recommendations#id");expect(notificationHref({entityType:"activity",entityId:"id"})).toBe("/feed#id");expect(notificationHref({entityType:"profile",actor:{id:"x",username:"ada",displayName:"Ada"}})).toBe("/u/ada");});
});
