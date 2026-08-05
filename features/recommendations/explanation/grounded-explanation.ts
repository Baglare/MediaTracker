import type { AiNearMatchRecommendation, AiRecommendation } from "@/lib/ai/types";
import { ASPECT_REGISTRY } from "../domain/aspect-registry";
import type { RecommendationRequestV2 } from "../domain/codec";
import type { ScoredRecommendationCandidate } from "../ranking/types";

const SOURCE_LABELS = { anilist: "AniList", tvmaze: "TVMaze", tmdb: "TMDB", omdb: "OMDb", openlibrary: "Open Library" } as const;
const LEVEL_LABELS = { primary: "Güçlü", significant: "Belirgin", incidental: "İkincil", absent: "Yok", unknown: "Bilinmiyor" } as const;
const CONFIDENCE_LABELS = { high: "Yüksek kanıt güveni", medium: "Orta kanıt güveni", low: "Düşük kanıt güveni", unknown: "Kanıt güveni bilinmiyor" } as const;

function evidenceSentence(item: ScoredRecommendationCandidate, request: RecommendationRequestV2): string[] {
  const sentences: string[] = [];
  for (const constraint of request.aspectConstraints) {
    if (constraint.role === "avoid") continue;
    const evidence = item.aspectEvidence.get(constraint.aspectId);
    const decision = item.aspectDecisions.find((entry) => entry.constraintId === constraint.id);
    if (!evidence || evidence.strength === null || !decision?.passed || decision.outcome === "not_preferred") continue;
    const provider = evidence.supportingEvidence.find((claim) => claim.provider)?.provider;
    const label = ASPECT_REGISTRY[constraint.aspectId].labelTr;
    sentences.push(`${label} sinyali ${provider ? SOURCE_LABELS[provider] : "yapılandırılmış metadata"} kanıtında ${evidence.level} düzeyinde (${evidence.confidence} güven).`);
  }
  const metadata = item.snapshot.objectiveMetadata;
  if (metadata.episodeCount !== undefined) sentences.push(`${metadata.episodeCount} bölüm bilgisi provider metadata'sından doğrulandı.`);
  else if (metadata.chapterCount !== undefined) sentences.push(`${metadata.chapterCount} bölüm bilgisi provider metadata'sından doğrulandı.`);
  else if (metadata.pageCount !== undefined) sentences.push(`${metadata.pageCount} sayfa bilgisi provider metadata'sından doğrulandı.`);
  if (sentences.length === 0 && metadata.genres?.length) sentences.push(`Provider türleri: ${metadata.genres.slice(0, 3).join(", ")}.`);
  return sentences.slice(0, 3);
}

function fitLabel(item: ScoredRecommendationCandidate, request: RecommendationRequestV2): string {
  const matched = request.aspectConstraints.find((constraint) => {
    if (constraint.role === "avoid") return false;
    const decision = item.aspectDecisions.find((entry) => entry.constraintId === constraint.id);
    return decision?.outcome === "passed" || decision?.outcome === "preferred";
  });
  if (matched) {
    const evidence = item.aspectEvidence.get(matched.aspectId);
    if (matched.aspectId === "romance" && evidence?.level === "primary") return "Güçlü romantizm";
    return `${ASPECT_REGISTRY[matched.aspectId].labelTr} tercihine uygun`;
  }
  const lengthMatched = item.objectiveDecisions.some((decision) => decision.passed
    && request.objectiveConstraints.some((constraint) => constraint.id === decision.constraintId && constraint.field === "length" && constraint.role !== "avoid"));
  if (lengthMatched) return "Kısa seri";
  if (request.profileSignalsEnabled && item.scoreBreakdown.personalFit > 0.2) return "Profil tercihlerine uygun";
  return "Yeni keşif";
}

function communitySignal(item: ScoredRecommendationCandidate): string | undefined {
  const score = item.snapshot.objectiveMetadata.communityScore;
  if (typeof score !== "number" || !Number.isFinite(score)) return undefined;
  const provider = SOURCE_LABELS[item.snapshot.candidateIdentity.primaryProvider];
  const tenPoint = score > 10 ? score / 10 : score;
  return `${provider} topluluk puanı: ${Math.max(0, Math.min(10, tenPoint)).toFixed(1)}/10`;
}

export function buildGroundedRecommendation(item: ScoredRecommendationCandidate, request: RecommendationRequestV2, index: number): AiRecommendation {
  const candidate = item.candidate;
  const riskWarnings = item.warnings.filter((warning) => warning.includes("unknown") || warning.includes("risk") || warning.includes("unavailable"));
  return {
    id: `v2-${item.snapshot.candidateIdentity.canonicalKey.replace(/[^A-Za-z0-9_-]/g, "-")}-${index}`,
    title: candidate.title,
    mediaType: candidate.type,
    source: SOURCE_LABELS[item.snapshot.candidateIdentity.primaryProvider],
    externalSource: item.snapshot.candidateIdentity.primaryProvider,
    externalId: item.snapshot.candidateIdentity.primaryExternalId,
    coverUrl: candidate.coverUrl,
    overview: candidate.overview,
    fitLabel: fitLabel(item, request),
    reason: evidenceSentence(item, request).join(" ") || "Provider kimliği ve objektif metadata doğrulandı; daha ayrıntılı aspect kanıtı bulunmuyor.",
    risk: riskWarnings.length > 0 ? "Bazı istek alanlarında kanıt eksik veya düşük güvenli." : undefined,
    communitySignal: communitySignal(item),
    inLibrary: false,
    candidate,
    resultKind: "primary",
    evidenceSummary: [
      ...request.aspectConstraints.flatMap((constraint) => {
        if (constraint.role === "avoid") return [];
        const evidence = item.aspectEvidence.get(constraint.aspectId);
        const decision = item.aspectDecisions.find((entry) => entry.constraintId === constraint.id);
        return evidence && decision?.passed && evidence.level !== "unknown" ? [{ label: ASPECT_REGISTRY[constraint.aspectId].labelTr, value: LEVEL_LABELS[evidence.level], confidenceLabel: CONFIDENCE_LABELS[evidence.confidence] }] : [];
      }),
      ...(item.snapshot.objectiveMetadata.episodeCount !== undefined ? [{ label: "Uzunluk", value: `${item.snapshot.objectiveMetadata.episodeCount} bölüm` }] : []),
      ...(item.snapshot.objectiveMetadata.pageCount !== undefined ? [{ label: "Uzunluk", value: `${item.snapshot.objectiveMetadata.pageCount} sayfa` }] : []),
    ].slice(0, 4),
  };
}

export function buildGroundedNearMatchRecommendation(item: ScoredRecommendationCandidate, request: RecommendationRequestV2, index: number): AiNearMatchRecommendation {
  const base = buildGroundedRecommendation(item, request, index);
  const violated = item.aspectDecisions.filter((decision) => (decision.role === "must" && !decision.passed) || decision.outcome === "triggered_avoid").map((decision) => {
    const constraint = request.aspectConstraints.find((entry) => entry.id === decision.constraintId);
    if (!constraint) return "Zorunlu koşul karşılanmadı";
    return constraint.role === "avoid"
      ? `${ASPECT_REGISTRY[constraint.aspectId].labelTr}: kaçınılacak içerik eşiği aşıldı`
      : `${ASPECT_REGISTRY[constraint.aspectId].labelTr}: zorunlu eşik karşılanmadı`;
  });
  const satisfied = item.aspectDecisions.filter((decision) => decision.role !== "avoid" && decision.passed).flatMap((decision) => {
    const constraint = request.aspectConstraints.find((entry) => entry.id === decision.constraintId);
    return constraint ? [ASPECT_REGISTRY[constraint.aspectId].labelTr] : [];
  });
  return { ...base, id: `near-${base.id}`, resultKind: "near_match", fitLabel: "Yakın eşleşme", violatedConstraints: violated, satisfiedConstraints: satisfied, nearMatchReason: violated.join("; ") || "Bir zorunlu koşul karşılanmadı." };
}

export function buildGroundedAssistantMessage(count: number, rejectedCount: number): string {
  if (count === 0) return "Doğrulanmış provider kanıtları ve zorunlu koşullar birlikte değerlendirildi; uygun yeni aday bulunamadı.";
  return `${count} doğrulanmış öneri, yapılandırılmış kanıt ve deterministik uygunluk sırasıyla hazırlandı${rejectedCount > 0 ? `; ${rejectedCount} aday zorunlu koşul veya kimlik politikası nedeniyle elendi` : ""}.`;
}
