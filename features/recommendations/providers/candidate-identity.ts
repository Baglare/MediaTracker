import type { RecommendationMediaType, RecommendationProvider } from "../domain/types";
import type {
  IdentityVerificationEvidence,
  RecommendationCandidateIdentity,
  SecondaryIdentity,
  SecondaryIdentityKind,
} from "./types";

const ID_PATTERN = /^[A-Za-z0-9/][A-Za-z0-9_./:-]{0,199}$/;

function normalizeExternalId(value: string): string {
  return value.normalize("NFKC").trim();
}

export function createCandidateCanonicalKey(
  provider: RecommendationProvider,
  mediaType: RecommendationMediaType,
  externalId: string,
): string {
  const normalized = normalizeExternalId(externalId);
  if (!normalized || !ID_PATTERN.test(normalized)) throw new Error("candidate_identity_invalid_external_id");
  return `${provider}:${mediaType}:${normalized}`;
}

export function createVerifiedCandidateIdentity(input: {
  primaryProvider: RecommendationProvider;
  primaryExternalId: string;
  mediaType: RecommendationMediaType;
  secondaryIds?: readonly SecondaryIdentity[];
  verificationEvidence?: readonly IdentityVerificationEvidence[];
}): RecommendationCandidateIdentity {
  const primaryExternalId = normalizeExternalId(input.primaryExternalId);
  const canonicalKey = createCandidateCanonicalKey(input.primaryProvider, input.mediaType, primaryExternalId);
  const unique = new Map<string, SecondaryIdentity>();
  for (const secondary of input.secondaryIds ?? []) {
    const externalId = normalizeExternalId(secondary.externalId);
    if (!externalId || !ID_PATTERN.test(externalId)) throw new Error("candidate_identity_invalid_secondary_id");
    unique.set(`${secondary.kind}:${externalId}`, { kind: secondary.kind, externalId });
  }
  return {
    primaryProvider: input.primaryProvider,
    primaryExternalId,
    mediaType: input.mediaType,
    verified: true,
    secondaryIds: [...unique.values()].sort((a, b) => `${a.kind}:${a.externalId}`.localeCompare(`${b.kind}:${b.externalId}`)),
    canonicalKey,
    verificationEvidence: input.verificationEvidence?.length
      ? [...input.verificationEvidence]
      : [{ provider: input.primaryProvider, field: "id", externalId: primaryExternalId }],
  };
}

export function secondaryIdentityMap(identity: RecommendationCandidateIdentity): Map<SecondaryIdentityKind, string> {
  return new Map(identity.secondaryIds.map((item) => [item.kind, item.externalId]));
}

const PRIMARY_PRIORITY: Readonly<Record<RecommendationMediaType, readonly RecommendationProvider[]>> = {
  anime: ["anilist"], manga: ["anilist"], manhwa: ["anilist"], manhua: ["anilist"],
  tv: ["tvmaze", "tmdb"], movie: ["tmdb", "omdb"], book: ["openlibrary"],
};

export function selectPrimaryIdentity(
  left: RecommendationCandidateIdentity,
  right: RecommendationCandidateIdentity,
): RecommendationCandidateIdentity {
  const order = PRIMARY_PRIORITY[left.mediaType];
  return order.indexOf(left.primaryProvider) <= order.indexOf(right.primaryProvider) ? left : right;
}

export interface IdentityLinkDecision {
  link: boolean;
  reason: "same_provider_id" | "exact_imdb" | "exact_thetvdb" | "exact_openlibrary_work" | "no_exact_bridge" | "identity_conflict" | "forbidden_anime_fusion";
  warning?: string;
}

export function evaluateExactIdentityLink(
  left: RecommendationCandidateIdentity,
  right: RecommendationCandidateIdentity,
): IdentityLinkDecision {
  if (left.mediaType !== right.mediaType) return { link: false, reason: "no_exact_bridge" };
  if (
    left.mediaType === "anime" &&
    new Set([left.primaryProvider, right.primaryProvider]).has("tvmaze")
  ) return { link: false, reason: "forbidden_anime_fusion" };
  if (left.primaryProvider === right.primaryProvider && left.primaryExternalId === right.primaryExternalId) {
    return { link: true, reason: "same_provider_id" };
  }
  const a = secondaryIdentityMap(left);
  const b = secondaryIdentityMap(right);
  const sharedKinds: SecondaryIdentityKind[] = ["imdb", "thetvdb", "openlibrary_work"];
  const matches = sharedKinds.filter((kind) => a.has(kind) && b.has(kind) && a.get(kind) === b.get(kind));
  const conflicts = sharedKinds.filter((kind) => a.has(kind) && b.has(kind) && a.get(kind) !== b.get(kind));
  if (matches.length > 0 && conflicts.length > 0) {
    return { link: false, reason: "identity_conflict", warning: `conflicting_exact_identity:${conflicts.join(",")}` };
  }
  if (matches.includes("imdb")) return { link: true, reason: "exact_imdb" };
  if (matches.includes("thetvdb")) return { link: true, reason: "exact_thetvdb" };
  if (matches.includes("openlibrary_work")) return { link: true, reason: "exact_openlibrary_work" };
  return { link: false, reason: "no_exact_bridge" };
}
