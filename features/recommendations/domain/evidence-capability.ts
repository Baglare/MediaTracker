import {
  ASPECT_REGISTRY,
  evidenceStrategyForProvider,
  queryableProviderRetrievalMapping,
  type AspectId,
  type AspectRegistryEntry,
} from "./aspect-registry";
import type { RecommendationRequestV2 } from "./codec";
import type { AspectConstraint } from "./constraints";
import type {
  RecommendationDomainIssue,
  RecommendationMediaType,
  RecommendationProvider,
  SemanticVerifierMode,
} from "./types";
import { rankedTagProviderCoverageFor } from "./ranked-tag-provider-coverage";

export type ConstraintEvidenceCapabilityStatus =
  | "structured_supported"
  | "ranked_tag_supported"
  | "requires_semantic_verifier"
  | "soft_only"
  | "unsupported_for_target";

export interface ConstraintEvidenceCapability {
  constraintId: string;
  aspectId: AspectId;
  status: ConstraintEvidenceCapabilityStatus;
  providers: readonly RecommendationProvider[];
  reasonCode: string;
  userMessage: string;
  canUseAsMust: boolean;
  canUseAsAvoid: boolean;
  canUseAsPrefer: boolean;
}

const TARGET_PROVIDERS: Readonly<Record<RecommendationMediaType, readonly RecommendationProvider[]>> = {
  anime: ["anilist"],
  manga: ["anilist"],
  manhwa: ["anilist"],
  manhua: ["anilist"],
  tv: ["tvmaze", "tmdb"],
  movie: ["tmdb", "omdb"],
  book: ["openlibrary"],
};

function providersForTargets(targets: readonly RecommendationMediaType[]): RecommendationProvider[] {
  return [...new Set((targets.length > 0 ? targets : Object.keys(TARGET_PROVIDERS) as RecommendationMediaType[])
    .flatMap((target) => TARGET_PROVIDERS[target]))];
}

export function evaluateConstraintEvidenceCapability(input: {
  constraint: AspectConstraint;
  targetMediaTypes: readonly RecommendationMediaType[];
  semanticVerifierMode: SemanticVerifierMode;
  availableVerifierModes?: readonly Exclude<SemanticVerifierMode, "structured_only">[];
}): ConstraintEvidenceCapability {
  const entry = ASPECT_REGISTRY[input.constraint.aspectId] as AspectRegistryEntry;
  const supportedMediaTypes = entry.supportedMediaTypes;
  const targetSupported = input.targetMediaTypes.length === 0
    || input.targetMediaTypes.some((mediaType) => supportedMediaTypes.includes(mediaType));
  const providers = targetSupported
    ? providersForTargets(input.targetMediaTypes).filter((provider) => entry.providerSupport[provider] !== "unsupported")
    : [];
  const base = { constraintId: input.constraint.id, aspectId: input.constraint.aspectId, providers };
  if (providers.length === 0) {
    return {
      ...base,
      status: "unsupported_for_target",
      reasonCode: "constraint_evidence_unsupported_for_target",
      userMessage: "Seçilen medya türünde güvenilir veri kaynağı bulunmuyor.",
      canUseAsMust: false,
      canUseAsAvoid: false,
      canUseAsPrefer: false,
    };
  }

  const strategies = new Set(providers.map((provider) => evidenceStrategyForProvider(input.constraint.aspectId, provider)));
  if (strategies.has("exact_taxonomy")) {
    const canUseAsMust = entry.mustSafety !== "unsafe" && input.constraint.source !== "profile";
    const canUseAsAvoid = entry.avoidSafety !== "unsafe";
    const hardRoleUnsafe = (input.constraint.role === "must" && !canUseAsMust)
      || (input.constraint.role === "avoid" && !canUseAsAvoid);
    return {
      ...base,
      status: "structured_supported",
      reasonCode: hardRoleUnsafe ? "constraint_evidence_hard_role_unsafe" : "constraint_evidence_structured_supported",
      userMessage: hardRoleUnsafe ? "Bu özellik mevcut kanıtlarla zorunlu filtre olarak güvenle kullanılamıyor." : "Bu özellik yapılandırılmış tür verileriyle doğrulanabilir.",
      canUseAsMust,
      canUseAsAvoid,
      canUseAsPrefer: true,
    };
  }
  if (strategies.has("ranked_tag")) {
    const canUseAsMust = entry.mustSafety !== "unsafe" && input.constraint.source !== "profile";
    const canUseAsAvoid = entry.avoidSafety !== "unsafe";
    const hardRoleUnsafe = (input.constraint.role === "must" && !canUseAsMust)
      || (input.constraint.role === "avoid" && !canUseAsAvoid);
    const mediaTypes = input.targetMediaTypes.length > 0 ? input.targetMediaTypes : supportedMediaTypes;
    const coverage = providers.flatMap((provider) => mediaTypes.flatMap((mediaType) => {
      const item = rankedTagProviderCoverageFor(input.constraint.aspectId, provider, mediaType);
      return item ? [item] : [];
    }));
    const queryableProviders = providers.filter((provider) => mediaTypes.some((mediaType) => (
      queryableProviderRetrievalMapping(input.constraint.aspectId, provider, mediaType)?.strategy === "ranked_tag"
    )));
    if (queryableProviders.length === 0) {
      const semanticProviders = [...new Set(coverage
        .filter((item) => item.status === "semantic_confirmation_required")
        .map((item) => item.provider))];
      if (semanticProviders.length > 0) {
        const enhancedMode = input.semanticVerifierMode !== "structured_only"
          && (input.availableVerifierModes ?? []).includes(input.semanticVerifierMode);
        return {
          ...base,
          providers: semanticProviders,
          status: "requires_semantic_verifier",
          reasonCode: hardRoleUnsafe
            ? "constraint_evidence_hard_role_unsafe"
            : enhancedMode
              ? "constraint_evidence_semantic_verifier_selected"
              : "constraint_evidence_semantic_verifier_required",
          userMessage: hardRoleUnsafe
            ? "Bu özellik mevcut kanıtlarla zorunlu filtre olarak güvenle kullanılamıyor."
            : "Bu koşul için içerik özeti üzerinde semantik doğrulama gerekiyor.",
          canUseAsMust: enhancedMode && canUseAsMust,
          canUseAsAvoid: enhancedMode && canUseAsAvoid,
          canUseAsPrefer: true,
        };
      }
      const evidenceOnly = coverage.filter((item) => item.status === "evidence_only");
      if (evidenceOnly.length === 0) {
        return {
          ...base,
          status: "unsupported_for_target",
          reasonCode: "constraint_evidence_unsupported_for_target",
          userMessage: "Seçilen medya türünde güvenilir veri kaynağı bulunmuyor.",
          canUseAsMust: false,
          canUseAsAvoid: false,
          canUseAsPrefer: false,
        };
      }
      return {
        ...base,
        providers: [...new Set(evidenceOnly.map((item) => item.provider))],
        status: "soft_only",
        reasonCode: hardRoleUnsafe ? "constraint_evidence_hard_role_unsafe" : "constraint_evidence_ranked_tag_evidence_only",
        userMessage: hardRoleUnsafe
          ? "Bu özellik mevcut kanıtlarla zorunlu filtre olarak güvenle kullanılamıyor."
          : "Mevcut kaynak bu koşulu yalnız yumuşak tercih veya sonradan kanıt kontrolü olarak destekliyor.",
        canUseAsMust: false,
        canUseAsAvoid: evidenceOnly.some((item) => item.canUseAsAvoid) && canUseAsAvoid,
        canUseAsPrefer: true,
      };
    }
    return {
      ...base,
      providers: queryableProviders,
      status: "ranked_tag_supported",
      reasonCode: hardRoleUnsafe ? "constraint_evidence_hard_role_unsafe" : "constraint_evidence_ranked_tag_supported",
      userMessage: hardRoleUnsafe ? "Bu özellik etiketlerle bulunabilir ancak zorunlu filtre için yeterince güvenilir değil." : "Bu özellik AniList etiketleriyle doğrulanabilir.",
      canUseAsMust,
      canUseAsAvoid,
      canUseAsPrefer: true,
    };
  }
  if (strategies.has("semantic_required")) {
    const enhancedMode = input.semanticVerifierMode !== "structured_only"
      && (input.availableVerifierModes ?? []).includes(input.semanticVerifierMode);
    return {
      ...base,
      status: "requires_semantic_verifier",
      reasonCode: enhancedMode
        ? "constraint_evidence_semantic_verifier_selected"
        : "constraint_evidence_semantic_verifier_required",
      userMessage: "Bu koşul için içerik özeti üzerinde semantik doğrulama gerekiyor.",
      canUseAsMust: enhancedMode && input.constraint.source !== "profile",
      canUseAsAvoid: enhancedMode,
      canUseAsPrefer: true,
    };
  }
  return {
    ...base,
    status: "soft_only",
    reasonCode: "constraint_evidence_soft_only",
    userMessage: "Mevcut kaynak bu koşulu yalnız yumuşak tercih olarak destekliyor.",
    canUseAsMust: false,
    canUseAsAvoid: false,
    canUseAsPrefer: true,
  };
}

export function evaluateRequestEvidenceCapabilities(input: {
  request: RecommendationRequestV2;
  availableVerifierModes?: readonly Exclude<SemanticVerifierMode, "structured_only">[];
}): { capabilities: ConstraintEvidenceCapability[]; issues: RecommendationDomainIssue[] } {
  const capabilities = input.request.aspectConstraints.map((constraint) => evaluateConstraintEvidenceCapability({
    constraint,
    targetMediaTypes: input.request.targetMediaTypes,
    semanticVerifierMode: input.request.semanticVerifierMode,
    availableVerifierModes: input.availableVerifierModes,
  }));
  const issues = capabilities.flatMap((capability, index) => {
    const constraint = input.request.aspectConstraints[index];
    const allowed = constraint.role === "must"
      ? capability.canUseAsMust
      : constraint.role === "avoid"
        ? capability.canUseAsAvoid
        : capability.canUseAsPrefer;
    return allowed ? [] : [{
      code: capability.reasonCode,
      path: `aspectConstraints.${index}.role`,
      message: capability.userMessage,
    }];
  });
  return { capabilities, issues };
}
