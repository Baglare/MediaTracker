import { ASPECT_REGISTRY } from "../domain/aspect-registry";
import type { AspectConstraint, ObjectiveConstraint } from "../domain/constraints";
import type { RankedTagNoResultReason } from "@/lib/ai/types";

export function userFacingRankedTagNoResult(
  reason: RankedTagNoResultReason,
  aspectLabel = "İstenen içerik özelliği",
): string {
  if (reason === "provider_tag_mapping_missing") return "Bu özellik için seçilen kaynakta doğrudan arama desteği bulunmuyor.";
  if (reason === "provider_tag_no_candidates") return "Seçilen içerik etiketini taşıyan doğrulanmış aday bulunamadı.";
  if (reason === "provider_tag_query_unavailable") return "İçerik etiketi kaynağı şu anda kullanılamıyor; koşul başarısız sayılmadı.";
  if (reason === "candidates_below_tag_rank") return `Adaylar bulundu ancak ${aspectLabel.toLocaleLowerCase("tr-TR")} istenen belirginlik düzeyinin altında kaldı.`;
  if (reason === "candidates_failed_ranked_tag_confidence") return `${aspectLabel} için yeterli kanıt güvenine sahip doğrulanmış aday bulunamadı.`;
  if (reason === "candidates_failed_avoid") return "Doğrulanmış adaylar kaçınılacak içerik eşiğini aştı.";
  return "Doğrulanmış adaylar objektif filtrelerden birini karşılamadı.";
}

export function userFacingRecommendationWarning(code: string): string {
  const [kind, aspectId] = code.split(":", 2);
  const aspect = aspectId && aspectId in ASPECT_REGISTRY
    ? ASPECT_REGISTRY[aspectId as keyof typeof ASPECT_REGISTRY].labelTr
    : "Bu içerik özelliği";
  if (kind === "conditional_must_requires_evidence") {
    return `${aspect} özelliğini zorunlu tutmak için yeterli içerik kanıtı gerekiyor.`;
  }
  if (kind === "must_downgraded_unsupported") {
    return `${aspect} için zorunlu filtre güvenilir biçimde doğrulanamadığından tercih olarak yorumlandı.`;
  }
  if (kind === "aspect_constraint_conflict") {
    return `${aspect} için birbiriyle çelişen koşullar var.`;
  }
  return /[:_]/.test(code) ? "İstek koşullarından biri ek doğrulama gerektiriyor." : code;
}

export function userFacingRejectionReason(reason: string): string {
  const exact: Readonly<Record<string, string>> = {
    failed_must: "Zorunlu içerik eşiği karşılanmadı.",
    unknown: "Zorunlu koşul için yeterli içerik kanıtı bulunamadı.",
    triggered_avoid: "Kaçınılacak içerik eşiği aşıldı.",
    constraint_failed: "İstek koşullarından biri karşılanmadı.",
    explicit_request_evidence_missing: "Açık isteğinle doğrulanmış bir içerik ilişkisi bulunamadı.",
    candidates_below_request_coverage: "Açık isteğinle doğrulanmış bir içerik ilişkisi bulunamadı.",
    candidates_failed_romance_strength: "Romantizm istenen merkeziyet düzeyine ulaşmadı.",
    candidates_failed_aspect_strength: "İstenen içerik özelliği yeterince merkezi değil.",
    candidates_failed_confidence: "Zorunlu koşul için yeterli kanıt güveni bulunamadı.",
    candidates_failed_avoid: "Kaçınılacak içerik eşiği aşıldı.",
    candidates_failed_objective: "Objektif filtrelerden biri karşılanmadı.",
    exact_library_identity: "Bu eser zaten kütüphanende.",
    dismissed_exact_identity: "Bu eseri daha önce gizledin.",
    provider_identity_unverified: "Adayın provider kimliği doğrulanamadı.",
  };
  if (exact[reason]) return exact[reason];
  return /(^|[:_])[a-z0-9_:-]+$/.test(reason) && /[:_]/.test(reason)
    ? "Aday, öneri koşullarından birini karşılamadı."
    : reason;
}

export function userFacingNoResultSummary(input: {
  rejectedReasons: readonly string[];
  providerFallbackUsed: boolean;
  evaluatedCandidateCount: number;
  rankedTagNoResultReason?: RankedTagNoResultReason;
  rankedTagAspectLabel?: string;
}): string {
  if (input.rankedTagNoResultReason) {
    return userFacingRankedTagNoResult(input.rankedTagNoResultReason, input.rankedTagAspectLabel);
  }
  const reasons = new Set(input.rejectedReasons);
  if (reasons.has("provider_identity_unverified")) {
    return "Provider aday döndürdü ancak kesin kimliği doğrulanamayan eserler öneri havuzuna alınmadı.";
  }
  if (input.evaluatedCandidateCount === 0) {
    return input.providerFallbackUsed
      ? "Bazı kaynaklar kullanılamadı ve doğrulanmış aday elde edilemedi."
      : "Provider, onaylanan istek için doğrulanmış aday döndürmedi.";
  }
  if (reasons.has("candidates_failed_romance_strength")) {
    return "Romantizm için istenen merkeziyet düzeyini karşılayan doğrulanmış aday bulunamadı.";
  }
  if (reasons.has("candidates_failed_confidence")) {
    return "Zorunlu koşul için yeterli kanıt güvenine sahip doğrulanmış aday bulunamadı.";
  }
  if (reasons.has("candidates_failed_avoid")) {
    return "Doğrulanmış adaylar kaçınılacak içerik eşiğini aştı.";
  }
  if (reasons.has("candidates_failed_objective")) {
    return "Doğrulanmış adaylar süre, yayın durumu veya diğer objektif filtrelerden birini karşılamadı.";
  }
  if (reasons.has("candidates_below_request_coverage")) {
    return "Adaylarda açık içerik isteğinle doğrulanmış yeterli ilişki bulunamadı.";
  }
  return input.providerFallbackUsed
    ? "Bazı kanıt kaynakları kullanılamadı; doğrulanmamış başlık eklenmedi."
    : "Zorunlu koşullar doğrulanmış aday havuzunu daralttı; liste zayıf adaylarla doldurulmadı.";
}

export function userFacingConstraintLabel(constraint: AspectConstraint | ObjectiveConstraint): string {
  if (constraint.kind === "aspect") return ASPECT_REGISTRY[constraint.aspectId].labelTr;
  if (constraint.field === "length") return "Süre/uzunluk";
  if (constraint.field === "release_status") return "Yayın durumu";
  if (constraint.field === "release_year") return "Yayın yılı";
  if (constraint.field === "media_type") return "Medya türü";
  if (constraint.field === "format") return "Format";
  if (constraint.field === "language") return "Dil";
  return "Ülke";
}
