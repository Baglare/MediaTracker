import type { AiRecommendation } from "@/lib/ai/types";
import { ASPECT_REGISTRY } from "../domain/aspect-registry";
import type { RecommendationRequestV2 } from "../domain/codec";
import type { ScoredRecommendationCandidate } from "../ranking/types";

const SOURCE_LABELS = { anilist: "AniList", tvmaze: "TVMaze", tmdb: "TMDB", omdb: "OMDb", openlibrary: "Open Library" } as const;

function evidenceSentence(item: ScoredRecommendationCandidate, request: RecommendationRequestV2): string[] {
  const sentences: string[] = [];
  for (const constraint of request.aspectConstraints) {
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
    const decision = item.aspectDecisions.find((entry) => entry.constraintId === constraint.id);
    return decision?.outcome === "passed" || decision?.outcome === "preferred";
  });
  return matched ? `${ASPECT_REGISTRY[matched.aspectId].labelTr} eşleşmesi` : "Doğrulanmış metadata eşleşmesi";
}

export function buildGroundedRecommendation(item: ScoredRecommendationCandidate, request: RecommendationRequestV2, index: number): AiRecommendation {
  const candidate = item.candidate;
  const riskWarnings = item.warnings.filter((warning) => warning.includes("unknown") || warning.includes("risk") || warning.includes("unavailable"));
  const score = item.snapshot.objectiveMetadata.communityScore;
  const popularity = item.snapshot.objectiveMetadata.popularity;
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
    communitySignal: typeof score === "number" ? `Topluluk skoru: ${score}` : typeof popularity === "number" ? `Popülerlik sinyali: ${popularity}` : undefined,
    inLibrary: false,
    candidate,
  };
}

export function buildGroundedAssistantMessage(count: number, rejectedCount: number): string {
  if (count === 0) return "Doğrulanmış provider kanıtları ve zorunlu koşullar birlikte değerlendirildi; uygun yeni aday bulunamadı.";
  return `${count} doğrulanmış öneri, yapılandırılmış kanıt ve deterministik uygunluk sırasıyla hazırlandı${rejectedCount > 0 ? `; ${rejectedCount} aday zorunlu koşul veya kimlik politikası nedeniyle elendi` : ""}.`;
}
