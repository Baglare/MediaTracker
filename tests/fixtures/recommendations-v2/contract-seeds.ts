import type { RecommendationEvaluationCase, RecommendationEvaluationCandidateLabel } from "@/features/recommendations/evaluation";
import type { RecommendationRequestV2 } from "@/features/recommendations/domain/codec";
import type { AspectConstraint, ObjectiveConstraint } from "@/features/recommendations/domain/constraints";
import type { RecommendationMediaType, RecommendationProvider } from "@/features/recommendations/domain/types";
import type { CandidateProviderEvidenceSnapshot, RecommendationCandidateIdentity } from "@/features/recommendations/providers/types";

const at = "2026-08-04T00:00:00.000Z";
function identity(id: string, mediaType: RecommendationMediaType = "anime", provider: RecommendationProvider = "anilist"): RecommendationCandidateIdentity {
  return { primaryProvider: provider, primaryExternalId: id, mediaType, verified: true, secondaryIds: [], canonicalKey: `${provider}:${mediaType}:${id}`, verificationEvidence: [{ provider, field: "id", externalId: id }] };
}
function snapshot(id: string, mediaType: RecommendationMediaType = "anime", provider: RecommendationProvider = "anilist", metadata: CandidateProviderEvidenceSnapshot["objectiveMetadata"] = { mediaType }): CandidateProviderEvidenceSnapshot {
  return { schemaVersion: 1, candidateIdentity: identity(id, mediaType, provider), objectiveMetadata: metadata, rawEvidenceClaims: [], providerCoverage: { [provider]: "available" }, missingFields: [], fetchedAt: at, cacheStatus: "miss", warnings: [] };
}
function request(id: string, mediaType: RecommendationMediaType, aspects: AspectConstraint[] = [], objectives: ObjectiveConstraint[] = [], strictness: RecommendationRequestV2["strictness"] = "balanced"): RecommendationRequestV2 {
  return { version: 2, queryText: id.replaceAll("_", " "), targetMediaTypes: [mediaType], aspectConstraints: aspects, objectiveConstraints: [{ id: `${id}:type`, kind: "objective", field: "media_type", operator: "eq", value: mediaType, role: "must", source: "explicit" }, ...objectives], strictness, references: [], profileSignalsEnabled: false, semanticVerifierMode: "structured_only", locale: "tr-TR" };
}
function label(candidate: CandidateProviderEvidenceSnapshot, overrides: Partial<RecommendationEvaluationCandidateLabel> = {}): RecommendationEvaluationCandidateLabel {
  return { candidateIdentity: candidate.candidateIdentity, relevanceGrade: 3, hardConstraintPass: true, expectedAspectLevels: {}, expectedConfidenceBounds: {}, expectedAvoidViolation: false, supportedExplanationClaims: [], forbiddenExplanationClaims: ["unverified_claim"], expectedResultKind: "primary", labelSource: "synthetic_contract", ...overrides };
}
function seed(input: { id: string; mediaType?: RecommendationMediaType; strictness?: RecommendationRequestV2["strictness"]; candidates?: CandidateProviderEvidenceSnapshot[]; aspects?: AspectConstraint[]; objectives?: ObjectiveConstraint[]; labels?: RecommendationEvaluationCandidateLabel[]; primary?: string[]; near?: string[]; notes?: string[] }): RecommendationEvaluationCase {
  const mediaType = input.mediaType ?? "anime";
  const candidates = input.candidates ?? [snapshot(`${input.id}:1`, mediaType, mediaType === "book" ? "openlibrary" : mediaType === "tv" ? "tvmaze" : "anilist")];
  const labels = input.labels ?? candidates.map((candidate) => label(candidate));
  const structuredRequest = request(input.id, mediaType, input.aspects, input.objectives, input.strictness);
  return { version: 1, id: input.id, locale: "tr-TR", queryText: structuredRequest.queryText, structuredRequest, strictness: structuredRequest.strictness, libraryProfileFixture: { synthetic: true, favoriteAspectIds: [], avoidedAspectIds: [], exactSuppressedCandidateKeys: [] }, candidates, expectedConstraints: [...structuredRequest.aspectConstraints, ...structuredRequest.objectiveConstraints].map((constraint) => constraint.id), candidateLabels: labels, expectedPrimaryIds: input.primary ?? labels.filter((item) => item.expectedResultKind === "primary").map((item) => item.candidateIdentity.canonicalKey), expectedNearMatchIds: input.near ?? labels.filter((item) => item.expectedResultKind === "near_match").map((item) => item.candidateIdentity.canonicalKey), notes: input.notes ?? ["Sentetik contract fixture; kalite gold seti değildir."] };
}

const romanceMust: AspectConstraint = { id: "romance:must", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" };
const triangleAvoid: AspectConstraint = { id: "triangle:avoid", kind: "aspect", aspectId: "love_triangle", role: "avoid", source: "explicit", rejectAtLevel: "significant" };
const primaryRomance = snapshot("romance-primary");
const incidentalRomance = snapshot("romance-incidental");
const triangle = snapshot("triangle");
const short = snapshot("short", "anime", "anilist", { mediaType: "anime", episodeCount: 12 });
const unknownLength = snapshot("unknown-length");
const likelyAnimeTv = snapshot("tv-anime", "tv", "tvmaze", { mediaType: "tv", format: "Animation", language: "Japanese", genres: ["Anime"] });
const westernAnimation = snapshot("western-animation", "tv", "tvmaze", { mediaType: "tv", format: "Animation", language: "English", countries: ["US"] });
const subjectOnlyBook = snapshot("subject-book", "book", "openlibrary", { mediaType: "book", genres: ["Romance"] });

export const RECOMMENDATION_V2_CONTRACT_SEEDS: readonly RecommendationEvaluationCase[] = [
  seed({ id: "romance_primary_vs_incidental", candidates: [primaryRomance, incidentalRomance], aspects: [romanceMust], labels: [label(primaryRomance, { expectedAspectLevels: { romance: "primary" } }), label(incidentalRomance, { relevanceGrade: 1, hardConstraintPass: false, expectedAspectLevels: { romance: "incidental" }, expectedResultKind: "excluded" })] }),
  seed({ id: "love_triangle_avoid", candidates: [triangle], aspects: [triangleAvoid], labels: [label(triangle, { hardConstraintPass: false, expectedAspectLevels: { love_triangle: "significant" }, expectedAvoidViolation: true, expectedResultKind: "excluded" })] }),
  seed({ id: "episode_lte_13", candidates: [short], objectives: [{ id: "episode:lte:13", kind: "objective", field: "length", unit: "episode", operator: "lte", value: 13, role: "must", source: "explicit" }] }),
  seed({ id: "unknown_episode_count", candidates: [unknownLength], objectives: [{ id: "episode:known", kind: "objective", field: "length", unit: "episode", operator: "lte", value: 13, role: "must", source: "explicit" }], labels: [label(unknownLength, { hardConstraintPass: false, expectedResultKind: "excluded" })] }),
  seed({ id: "strict_vs_exploratory_near_match", strictness: "exploratory", candidates: [incidentalRomance], aspects: [romanceMust], labels: [label(incidentalRomance, { relevanceGrade: 2, hardConstraintPass: false, expectedAspectLevels: { romance: "incidental" }, expectedResultKind: "near_match" })] }),
  seed({ id: "tvmaze_confirmed_anime_exclusion", mediaType: "tv", candidates: [likelyAnimeTv], labels: [label(likelyAnimeTv, { relevanceGrade: 0, hardConstraintPass: false, expectedResultKind: "excluded" })] }),
  seed({ id: "western_animation_retained", mediaType: "tv", candidates: [westernAnimation] }),
  seed({ id: "openlibrary_subject_only_low_confidence", mediaType: "book", candidates: [subjectOnlyBook], aspects: [romanceMust], labels: [label(subjectOnlyBook, { relevanceGrade: 1, hardConstraintPass: false, expectedAspectLevels: { romance: "unknown" }, expectedConfidenceBounds: { romance: { min: "unknown", max: "low" } }, expectedResultKind: "excluded" })] }),
  seed({ id: "exact_dismissed_candidate", candidates: [primaryRomance], labels: [label(primaryRomance, { hardConstraintPass: true, expectedResultKind: "excluded" })], primary: [], notes: ["Exact canonical key suppression sözleşmesi."] }),
  { ...seed({ id: "unresolved_reference", candidates: [primaryRomance], primary: [] }), structuredRequest: { ...request("unresolved_reference", "anime"), references: [{ state: "unresolved", titleText: "Belirsiz Başlık" }] }, expectedPrimaryIds: [] },
  seed({ id: "cross_media_preference", mediaType: "manga", candidates: [snapshot("cross-media", "manga", "anilist")] }),
  seed({ id: "provider_unavailable", candidates: [], labels: [], primary: [], notes: ["Zorunlu provider unavailable; başlık uydurulmaz."] }),
  seed({ id: "contradictory_evidence", candidates: [primaryRomance], aspects: [romanceMust], labels: [label(primaryRomance, { expectedAspectLevels: { romance: "unknown" }, expectedConfidenceBounds: { romance: { min: "unknown", max: "medium" } }, hardConstraintPass: false, expectedResultKind: "excluded" })] }),
  seed({ id: "no_result_instead_of_forced_fill", candidates: [incidentalRomance], aspects: [romanceMust], labels: [label(incidentalRomance, { relevanceGrade: 1, hardConstraintPass: false, expectedAspectLevels: { romance: "incidental" }, expectedResultKind: "excluded" })], primary: [] }),
  seed({ id: "same_input_deterministic_ordering", candidates: [snapshot("stable-b"), snapshot("stable-a")], primary: ["anilist:anime:stable-a", "anilist:anime:stable-b"], notes: ["Stable identity tie-break contract fixture."] }),
];
