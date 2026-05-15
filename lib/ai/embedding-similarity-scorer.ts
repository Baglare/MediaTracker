import { buildLibraryItemEmbeddingText } from "@/lib/ai/embedding-text-builder";
import type { EmbeddingVectorPayload, EmbeddingVectorResult } from "@/lib/ai/embedding-types";
import type { AiCandidate } from "@/lib/ai/types";
import type { MediaItem } from "@/lib/types";

const REAL_EMBEDDING_PROVIDER = "python_service";
const REAL_EMBEDDING_DIMENSIONS = 384;

export interface EmbeddingProfilePayloads {
  payloads: EmbeddingVectorPayload[];
  positiveIds: string[];
  negativeIds: string[];
}

export interface EmbeddingSimilarityScoringResult {
  candidates: AiCandidate[];
  stats: {
    skipped?: "no_real_vectors" | "no_positive_profile";
    candidates: number;
    adjusted: number;
    averageScore: number;
    maxScore: number;
    minScore: number;
    positiveProfileItems: number;
    negativeProfileItems: number;
    provider: string;
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function positiveProfileItems(mediaItems: MediaItem[]): MediaItem[] {
  return mediaItems.filter((item) => Boolean(item.favorite) || (typeof item.userRating === "number" && item.userRating >= 8));
}

function negativeProfileItems(mediaItems: MediaItem[]): MediaItem[] {
  return mediaItems.filter((item) => item.status === "dropped" || (typeof item.userRating === "number" && item.userRating <= 4));
}

function profilePayloadId(kind: "positive" | "negative", item: MediaItem): string {
  return `profile:${kind}:${item.id}`;
}

export function buildEmbeddingSimilarityProfilePayloads(mediaItems: MediaItem[]): EmbeddingProfilePayloads {
  const payloads: EmbeddingVectorPayload[] = [];
  const positiveIds: string[] = [];
  const negativeIds: string[] = [];

  for (const item of positiveProfileItems(mediaItems)) {
    const embedding = buildLibraryItemEmbeddingText(item);
    const id = profilePayloadId("positive", item);
    positiveIds.push(id);
    payloads.push({
      id,
      text: embedding.text,
      hash: embedding.hash,
      signals: embedding.signals,
      metadata: { profile: "positive", mediaType: item.type, title: item.title },
    });
  }

  for (const item of negativeProfileItems(mediaItems)) {
    const embedding = buildLibraryItemEmbeddingText(item);
    const id = profilePayloadId("negative", item);
    negativeIds.push(id);
    payloads.push({
      id,
      text: embedding.text,
      hash: embedding.hash,
      signals: embedding.signals,
      metadata: { profile: "negative", mediaType: item.type, title: item.title },
    });
  }

  return { payloads, positiveIds, negativeIds };
}

function averageVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dimensions = vectors[0].length;
  const out = Array.from({ length: dimensions }, () => 0);
  for (const vector of vectors) {
    for (let i = 0; i < dimensions; i++) {
      out[i] += vector[i];
    }
  }
  return out.map((value) => value / vectors.length);
}

function isRealVector(result: EmbeddingVectorResult | undefined, provider: string): result is EmbeddingVectorResult {
  return Boolean(
    result &&
      provider === REAL_EMBEDDING_PROVIDER &&
      result.provider === REAL_EMBEDDING_PROVIDER &&
      result.dimensions === REAL_EMBEDDING_DIMENSIONS &&
      result.vector.length === REAL_EMBEDDING_DIMENSIONS
  );
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function applyEmbeddingSimilarityScoring(args: {
  candidates: AiCandidate[];
  vectorResults: EmbeddingVectorResult[];
  provider: string;
  positiveProfileIds: string[];
  negativeProfileIds: string[];
}): EmbeddingSimilarityScoringResult {
  const resultById = new Map(args.vectorResults.map((result) => [result.id, result]));
  const positiveVectors = args.positiveProfileIds
    .map((id) => resultById.get(id))
    .filter((result): result is EmbeddingVectorResult => isRealVector(result, args.provider))
    .map((result) => result.vector);
  const negativeVectors = args.negativeProfileIds
    .map((id) => resultById.get(id))
    .filter((result): result is EmbeddingVectorResult => isRealVector(result, args.provider))
    .map((result) => result.vector);

  const hasRealVectors = args.vectorResults.some((result) => isRealVector(result, args.provider));
  if (
    args.provider !== REAL_EMBEDDING_PROVIDER ||
    !hasRealVectors ||
    args.vectorResults.some((result) => result.dimensions !== REAL_EMBEDDING_DIMENSIONS)
  ) {
    return {
      candidates: args.candidates,
      stats: {
        skipped: "no_real_vectors",
        candidates: args.candidates.length,
        adjusted: 0,
        averageScore: 0,
        maxScore: 0,
        minScore: 0,
        positiveProfileItems: args.positiveProfileIds.length,
        negativeProfileItems: args.negativeProfileIds.length,
        provider: args.provider,
      },
    };
  }

  if (positiveVectors.length === 0) {
    return {
      candidates: args.candidates,
      stats: {
        skipped: "no_positive_profile",
        candidates: args.candidates.length,
        adjusted: 0,
        averageScore: 0,
        maxScore: 0,
        minScore: 0,
        positiveProfileItems: args.positiveProfileIds.length,
        negativeProfileItems: args.negativeProfileIds.length,
        provider: args.provider,
      },
    };
  }

  const positiveAverage = averageVector(positiveVectors);
  const negativeAverage = averageVector(negativeVectors);
  let adjusted = 0;
  let total = 0;

  const candidates = args.candidates.map((candidate) => {
    const id = `${candidate.source}:${candidate.externalId}`;
    const vectorResult = resultById.get(id);
    if (!isRealVector(vectorResult, args.provider)) {
      return { ...candidate, embeddingScore: 0, embeddingSimilarityReasons: [] };
    }

    const positiveSimilarity = cosineSimilarity(vectorResult.vector, positiveAverage);
    const negativeSimilarity = negativeAverage.length > 0 ? cosineSimilarity(vectorResult.vector, negativeAverage) : 0;
    const embeddingScore = roundScore(positiveSimilarity * 5 - negativeSimilarity * 6);
    const reasons: string[] = [];

    if (embeddingScore >= 1.2) {
      reasons.push("Yüksek puan verdiğin içeriklerle anlamsal olarak benziyor.");
    } else if (embeddingScore >= 0.5) {
      reasons.push("Favorilerine yakın bir açıklama/tür profili taşıyor.");
    }
    if (negativeSimilarity > positiveSimilarity && negativeSimilarity >= 0.25) {
      reasons.push("Düşük puan verdiğin veya bıraktığın içeriklere benzerlik riski var.");
    }

    if (embeddingScore !== 0) {
      adjusted++;
      total += embeddingScore;
    }

    return {
      ...candidate,
      embeddingScore,
      embeddingSimilarityReasons: reasons,
      scoreReasons: Array.from(new Set([...(candidate.scoreReasons || []), ...reasons])).slice(0, 6),
    };
  });

  const scores = candidates.map((candidate) => candidate.embeddingScore || 0);
  return {
    candidates,
    stats: {
      candidates: candidates.length,
      adjusted,
      averageScore: adjusted > 0 ? roundScore(total / adjusted) : 0,
      maxScore: scores.length > 0 ? Math.max(...scores) : 0,
      minScore: scores.length > 0 ? Math.min(...scores) : 0,
      positiveProfileItems: positiveVectors.length,
      negativeProfileItems: negativeVectors.length,
      provider: args.provider,
    },
  };
}
