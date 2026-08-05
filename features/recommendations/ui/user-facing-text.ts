import { ASPECT_REGISTRY } from "../domain/aspect-registry";
import type { AspectConstraint, ObjectiveConstraint } from "../domain/constraints";

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
    exact_library_identity: "Bu eser zaten kütüphanende.",
    dismissed_exact_identity: "Bu eseri daha önce gizledin.",
  };
  if (exact[reason]) return exact[reason];
  return /(^|[:_])[a-z0-9_:-]+$/.test(reason) && /[:_]/.test(reason)
    ? "Aday, öneri koşullarından birini karşılamadı."
    : reason;
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
