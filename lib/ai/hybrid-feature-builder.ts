import type {
  AiCandidate,
  AiIntent,
  CandidateFeatureVector,
  LibraryProfile,
} from "@/lib/ai/types";

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function genreValues(candidate: AiCandidate): string[] {
  return (candidate.genres || []).map(normalize).filter(Boolean);
}

function messageHasAny(message: string, terms: RegExp[]): boolean {
  return terms.some((term) => term.test(message));
}

function contentScoreFor(candidate: AiCandidate, intent: AiIntent, message: string): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];
  const genres = genreValues(candidate);
  const text = `${message} ${intent.mood.join(" ")} ${intent.avoid.join(" ")}`.toLowerCase();

  const contentMatches: { label: string; terms: RegExp[]; genres: string[] }[] = [
    { label: "aksiyon", terms: [/aksiyon|action|dövüş|dovus/], genres: ["action", "martial arts", "adventure"] },
    { label: "romantik", terms: [/romantik|romance|aşk|ask/], genres: ["romance"] },
    { label: "fantastik", terms: [/fantasy|fantastik|fantazi/], genres: ["fantasy", "supernatural"] },
    { label: "gizem", terms: [/gizem|mystery|detektif/], genres: ["mystery", "detective", "thriller"] },
    { label: "komedi", terms: [/komedi|komik|comedy/], genres: ["comedy", "slice of life"] },
    { label: "karanlık", terms: [/karanlık|karanlik|dark|grim/], genres: ["psychological", "horror", "thriller", "drama"] },
  ];

  for (const match of contentMatches) {
    if (!messageHasAny(text, match.terms)) continue;
    const hit = match.genres.find((genre) => genres.includes(genre));
    if (!hit) continue;
    score += 1.5;
    reasons.push(`İçerik tonu "${match.label}" isteğiyle uyumlu`);
  }

  if (intent.targetTypes.includes(candidate.type)) {
    score += 1;
    reasons.push(`İstenen medya türüyle içerik uyumu var`);
  }

  if (candidate.overview && candidate.overview.length > 140) {
    score += 0.4;
  }

  return { score: roundScore(score), reasons: Array.from(new Set(reasons)).slice(0, 2) };
}

function behaviorScoreFor(candidate: AiCandidate, profile: LibraryProfile | null): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  if (candidate.favorite) {
    score += 2;
    reasons.push("Davranış sinyali: favori kayıt");
  }
  if (typeof candidate.userRating === "number" && candidate.userRating >= 8) {
    score += 1.5;
    reasons.push("Davranış sinyali: yüksek kişisel puan");
  }
  if ((candidate.currentProgress || 0) > 0) {
    score += 0.8;
    reasons.push("Davranış sinyali: başlanmış kayıt");
  }
  if (candidate.status === "dropped") {
    score -= 3;
    reasons.push("Davranış sinyali: bırakılmış kayıt riski");
  }
  if (candidate.status === "paused") {
    score -= 1.2;
    reasons.push("Davranış sinyali: duraklatılmış kayıt riski");
  }

  const highRatedSameType = profile?.highRated?.some((item) => item.type === candidate.type && item.rating >= 8) ?? false;
  if (highRatedSameType) {
    score += 0.8;
    reasons.push("Davranış geçmişinde bu tür güçlü");
  }

  return { score: roundScore(score), reasons: Array.from(new Set(reasons)).slice(0, 2) };
}

function popularityScoreFor(candidate: AiCandidate): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (typeof candidate.averageScore !== "number" || candidate.averageScore <= 0) {
    return { score: 0, reasons };
  }

  const normalized = candidate.averageScore > 10 ? candidate.averageScore / 10 : candidate.averageScore;
  let score = 0;
  if (normalized >= 8) {
    score = 1.8;
    reasons.push("Popülerlik sinyali: güçlü topluluk puanı");
  } else if (normalized >= 7) {
    score = 1;
    reasons.push("Popülerlik sinyali: iyi topluluk puanı");
  } else if (normalized < 5.5) {
    score = -1;
    reasons.push("Popülerlik sinyali: zayıf topluluk puanı");
  }

  return { score: roundScore(score), reasons };
}

export function buildCandidateFeatureVector(args: {
  candidate: AiCandidate;
  intent: AiIntent;
  message: string;
  profile: LibraryProfile | null;
}): CandidateFeatureVector {
  const { candidate, intent, message, profile } = args;
  const feedbackScore = candidate.feedbackScore || 0;
  const ruleScore = roundScore((candidate.score || 0) - feedbackScore);
  const content = contentScoreFor(candidate, intent, message);
  const behavior = behaviorScoreFor(candidate, profile);
  const popularity = popularityScoreFor(candidate);

  return {
    candidateKey: `${candidate.source}:${candidate.externalId}`,
    title: candidate.title,
    mediaType: candidate.type,
    source: candidate.source,
    ruleScore,
    feedbackScore: roundScore(feedbackScore),
    contentScore: content.score,
    behaviorScore: behavior.score,
    popularityScore: popularity.score,
    textSimilarityScore: candidate.textSimilarityScore || 0,
    contentReasons: content.reasons,
    behaviorReasons: behavior.reasons,
    popularityReasons: popularity.reasons,
    textSimilarityReasons: candidate.textSimilarityReasons || [],
  };
}

export function buildCandidateFeatureVectors(args: {
  candidates: AiCandidate[];
  intent: AiIntent;
  message: string;
  profile: LibraryProfile | null;
}): CandidateFeatureVector[] {
  return args.candidates.map((candidate) => buildCandidateFeatureVector({ ...args, candidate }));
}
