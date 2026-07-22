import { describe, expect, it } from "vitest";
import { activeMediaEntitlements, buildLegacyAggregate, buildSafeMediaSnapshot, buildSafeMediaState, calculateLegacyXp, commitmentBonus, dominantWorld, generalLevel, levelBounds, worldLevel, xpEventLabel } from "@/lib/xp/progression";
import { validateLegacyAggregate, validateLocalEventPayload, validateMediaStateBatch } from "@/lib/xp/validation";
import type { MediaItem, ProgressLog } from "@/lib/types";

const media: MediaItem = { id: "m1", title: "Dune", type: "book", status: "completed", coverImage: "data:image/png;base64,secret", currentProgress: 500, totalProgress: 500, externalSource: "openlibrary", externalId: "OL1", favorite: true, userRating: 9, personalNotes: "özel not" };
const log: ProgressLog = { id: "l1", mediaId: "m1", mediaTitle: "Dune", mediaType: "book", action: "complete", amount: 500, unit: "page", previousProgress: 0, newProgress: 500, createdAt: "2026-07-22T00:00:00.000Z" };

describe("XP V2 progression math", () => {
  it.each([[0,1],[99,1],[100,2],[399,2],[400,3],[10_000,11]])("calculates general level for %i XP", (xp, level) => expect(generalLevel(xp)).toBe(level));
  it("keeps square level boundaries", () => expect(levelBounds(4)).toEqual({ current: 900, next: 1600 }));
  it.each([[0,1],[74,1],[75,2],[299,2],[300,3]])("calculates world level for %i XP", (xp, level) => expect(worldLevel(xp)).toBe(level));
  it.each([[0,0],[1,0],[2,3],[12,3],[13,7],[50,7],[51,10],[200,10],[201,15],[50_000,15]])("caps commitment bonus for %i progress", (progress, bonus) => expect(commitmentBonus(progress)).toBe(bonus));
  it("resolves a unique dominant world and makes ties mixed", () => { expect(dominantWorld([{key:"east",xp:20},{key:"screen",xp:10},{key:"arch",xp:0}])).toBe("east"); expect(dominantWorld([{key:"east",xp:20},{key:"screen",xp:20}])).toBe("mixed"); });
  it("builds the exact legacy V1 aggregate and server formula", () => { const aggregate=buildLegacyAggregate([media],[log]); expect(aggregate).toEqual({mediaCount:1,progressLogCount:1,completedCount:1,ratedCount:1,favoriteCount:1,notedCount:1,worldCounts:{east:0,screen:0,arch:1}}); expect(calculateLegacyXp(aggregate)).toBe(66); });
  it("never sends private notes or data URLs in a safe media snapshot", () => { const snapshot=buildSafeMediaSnapshot(media); expect(snapshot).not.toHaveProperty("personalNotes"); expect(snapshot).not.toHaveProperty("overview"); expect(snapshot.coverUrl).toBeUndefined(); expect(snapshot.canonicalKey).toBe("openlibrary:ol1"); });
  it("derives current-state entitlements instead of transition rewards",()=>{const state=buildSafeMediaState(media);expect(activeMediaEntitlements(state)).toEqual(["media_started","media_completed","media_rated"]);expect(activeMediaEntitlements({...state,status:"planning",progress:0,hasRating:false})).toEqual([]);expect(activeMediaEntitlements({...state,deleted:true},{hasPublicReview:true,isShowcased:true})).toEqual([]);});
  it("represents profile review and showcase as reversible state",()=>{const state=buildSafeMediaState({...media,status:"planning",currentProgress:0,userRating:null});expect(activeMediaEntitlements(state,{hasPublicReview:true,isShowcased:true})).toEqual(["review_published","showcase_curated"]);expect(activeMediaEntitlements(state)).toEqual([]);});
  it("uses clear Turkish grant, revoke and restore history labels",()=>{expect(xpEventLabel("media_completed","grant")).toBe("Medya tamamlandı");expect(xpEventLabel("media_completed","revoke")).toBe("Tamamlanma durumu kaldırıldı");expect(xpEventLabel("media_completed","restore")).toBe("Medya yeniden tamamlandı");});
});

describe("XP runtime validation", () => {
  it("rejects client XP amounts and unsafe media fields at the route contract boundary", () => { const result=validateLocalEventPayload({eventType:"media_completed",canonicalMediaKey:"openlibrary:ol1",idempotencyKey:"media_completed:u:openlibrary:ol1",media:{...buildSafeMediaSnapshot(media),personalNotes:"secret"}}); expect(result.ok).toBe(false); });
  it("accepts a safe local event without an amount", () => { const snapshot=buildSafeMediaSnapshot(media); expect(validateLocalEventPayload({eventType:"media_completed",canonicalMediaKey:snapshot.canonicalKey,idempotencyKey:"media_completed:u:openlibrary:ol1",media:snapshot,totalProgress:500}).ok).toBe(true); });
  it("rejects negative and inconsistent legacy aggregates", () => { expect(validateLegacyAggregate({mediaCount:-1,progressLogCount:0,completedCount:0,ratedCount:0,favoriteCount:0,notedCount:0,worldCounts:{east:0,screen:0,arch:0}}).ok).toBe(false); expect(validateLegacyAggregate({mediaCount:2,progressLogCount:0,completedCount:0,ratedCount:0,favoriteCount:0,notedCount:0,worldCounts:{east:2,screen:1,arch:0}}).ok).toBe(false); });
  it("accepts a consistent aggregate and never accepts client total XP", () => { const result=validateLegacyAggregate({mediaCount:2,progressLogCount:1,completedCount:1,ratedCount:1,favoriteCount:1,notedCount:1,totalXp:999999,worldCounts:{east:1,screen:1,arch:0}}); expect(result.ok).toBe(true); expect(result.ok && result.value).not.toHaveProperty("totalXp"); });
  it("validates a repeatable per-media state batch and rejects client effect",()=>{const state=buildSafeMediaState(media);expect(validateMediaStateBatch({items:[state],replace:true}).ok).toBe(true);expect(validateMediaStateBatch({items:[{...state,effect:-1}],replace:false}).ok).toBe(false);});
  it("rejects duplicate canonical media and private note fields in a batch",()=>{const state=buildSafeMediaState(media);expect(validateMediaStateBatch({items:[state,state]}).ok).toBe(false);expect(validateMediaStateBatch({items:[{...state,personalNotes:"secret"}]}).ok).toBe(false);});
});
