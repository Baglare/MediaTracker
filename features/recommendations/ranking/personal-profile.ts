import type { RecommendationFeedbackEvent } from "@/lib/ai/types";
import type { MediaItem } from "@/lib/types";
import { ASPECT_IDS, findAspectByAlias, type AspectId } from "../domain/aspect-registry";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";
import type { RecommendationFeedbackEventV2 } from "../feedback";

export interface PersonalPreferenceProfile {
  loved: ReadonlyMap<AspectId, number>;
  consumed: ReadonlyMap<AspectId, number>;
  avoided: ReadonlyMap<AspectId, number>;
}

function aspects(values: readonly string[]): AspectId[] {
  const ids = new Set<AspectId>();
  for (const value of values) {
    const tr = findAspectByAlias(value, "tr");
    const en = findAspectByAlias(value, "en");
    if (tr) ids.add(tr);
    if (en) ids.add(en);
  }
  return [...ids];
}

function add(map: Map<AspectId, number>, id: AspectId, value: number): void {
  map.set(id, (map.get(id) ?? 0) + value);
}

export function buildPersonalPreferenceProfile(items: readonly MediaItem[]): PersonalPreferenceProfile {
  const loved = new Map<AspectId, number>();
  const consumed = new Map<AspectId, number>();
  const avoided = new Map<AspectId, number>();
  for (const item of items) {
    const ids = aspects([...(item.genres ?? []), ...(item.subjects ?? []), ...(item.tags ?? [])]);
    for (const id of ids) {
      add(consumed, id, 0.12);
      if (item.favorite) add(loved, id, 1.5);
      if ((item.userRating ?? -1) >= 8) add(loved, id, 1 + ((item.userRating ?? 8) - 8) * 0.25);
      if (item.status === "dropped" || (typeof item.userRating === "number" && item.userRating <= 4)) add(avoided, id, 1);
    }
  }
  return { loved, consumed, avoided };
}

function exactFeedbackAdjustment(candidateKey: string, feedback: readonly RecommendationFeedbackEvent[]): number {
  let adjustment = 0;
  for (const event of feedback) {
    if (!event.externalSource || !event.externalId) continue;
    if (!candidateKey.endsWith(`:${event.externalId}`) || !candidateKey.startsWith(`${event.externalSource}:`)) continue;
    if (event.action === "dismissed") adjustment -= 1;
    else if (event.action === "added") adjustment += 0.45;
    else if (event.action === "similar_requested") adjustment += 0.3;
  }
  return adjustment;
}

export function calculatePersonalFit(input: {
  profile: PersonalPreferenceProfile;
  snapshot: CandidateProviderEvidenceSnapshot;
  aspectEvidence: ReadonlyMap<AspectId, import("../domain/evidence").AspectEvidence>;
  feedback: readonly RecommendationFeedbackEvent[];
  feedbackV2?: readonly RecommendationFeedbackEventV2[];
  suppressedAspectIds?: ReadonlySet<AspectId>;
}): number {
  let total = 0;
  let weight = 0;
  for (const id of ASPECT_IDS) {
    if (input.suppressedAspectIds?.has(id)) continue;
    const evidence = input.aspectEvidence.get(id);
    if (!evidence || evidence.strength === null) continue;
    const preference = Math.min(2, input.profile.loved.get(id) ?? 0) * 0.45
      + Math.min(1, input.profile.consumed.get(id) ?? 0) * 0.12
      - Math.min(2, input.profile.avoided.get(id) ?? 0) * 0.55;
    if (preference === 0) continue;
    total += evidence.strength * preference;
    weight += Math.abs(preference);
  }
  const aspectFit = weight > 0 ? total / weight : 0;
  const exact = exactFeedbackAdjustment(input.snapshot.candidateIdentity.canonicalKey, input.feedback);
  let reasonAdjustment = 0;
  for (const event of input.feedbackV2 ?? []) {
    if (event.reasonCode === "not_interested_now" || event.reasonCode === "already_known") continue;
    for (const id of event.aspectIds) {
      if (input.suppressedAspectIds?.has(id)) continue;
      const evidence = input.aspectEvidence.get(id);
      if (!evidence || evidence.strength === null) continue;
      const negative = ["weak_requested_aspect", "too_much_aspect", "wrong_tone", "love_triangle", "fanservice", "violence_gore"].includes(event.reasonCode ?? "");
      reasonAdjustment += evidence.strength * (negative ? -0.12 : event.action === "similar_requested" ? 0.08 : 0);
    }
  }
  return Math.max(-1, Math.min(1, aspectFit + exact + Math.max(-0.35, Math.min(0.25, reasonAdjustment))));
}

export function hasExactLibraryIdentity(snapshot: CandidateProviderEvidenceSnapshot, items: readonly MediaItem[]): boolean {
  const identity = snapshot.candidateIdentity;
  return items.some((item) => {
    if (item.externalSource === identity.primaryProvider && item.externalId === identity.primaryExternalId) return true;
    if (item.imdbId && identity.secondaryIds.some((id) => id.kind === "imdb" && id.externalId === item.imdbId)) return true;
    return false;
  });
}
