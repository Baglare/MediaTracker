import type {
  RecommendationDecodeResult,
  RecommendationDomainIssue,
} from "../../domain/types";
import {
  forbiddenRetainedFields,
  provenanceIdentityKey,
  sourcePolicyAllowsPublication,
  sourcePolicyAllowsTraining,
} from "./provenance";
import type { DatasetPackage, DatasetSplit } from "./types";

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function isTrainingSplit(split: DatasetSplit): boolean {
  return split === "train";
}

export function validateDatasetPackage(value: DatasetPackage): RecommendationDecodeResult<DatasetPackage> {
  const issues: RecommendationDomainIssue[] = [];
  const records = new Map<string, (typeof value.records)[number]>();
  const provenanceByRecord = new Map<string, (typeof value.provenance)[number]>();
  const policies = new Map(value.manifest.sourcePolicies.map((policy) => [policy.sourceId, policy]));

  if (value.manifest.recordCount !== value.records.length) {
    issues.push(issue("dataset_record_count_mismatch", "manifest.recordCount", "Manifest recordCount gerçek kayıt sayısıyla eşleşmelidir."));
  }

  value.records.forEach((record, index) => {
    if (records.has(record.recordId)) {
      issues.push(issue("dataset_record_duplicate", `records.${index}.recordId`, "Dataset recordId tekrarlandı."));
    } else {
      records.set(record.recordId, record);
    }
  });

  value.provenance.forEach((provenance, index) => {
    if (provenanceByRecord.has(provenance.recordId)) {
      issues.push(issue("dataset_provenance_duplicate", `provenance.${index}.recordId`, "Aynı record için birden fazla provenance kaydı olamaz."));
    } else {
      provenanceByRecord.set(provenance.recordId, provenance);
    }
    if (!records.has(provenance.recordId)) {
      issues.push(issue("dataset_provenance_orphan", `provenance.${index}.recordId`, "Provenance mevcut bir recordId'ye bağlı olmalıdır."));
    }
    const policy = policies.get(provenance.sourceId);
    if (!policy) {
      issues.push(issue("dataset_source_policy_missing", `provenance.${index}.sourceId`, "Provenance sourceId manifest policy kaydıyla eşleşmelidir."));
      return;
    }
    if (policy.sourceType !== provenance.sourceType) {
      issues.push(issue("dataset_source_type_mismatch", `provenance.${index}.sourceType`, "Provenance sourceType policy ile eşleşmelidir."));
    }
    if (provenance.allowedUses.some((allowedUse) => !policy.allowedUses.includes(allowedUse))) {
      issues.push(issue("dataset_allowed_use_exceeds_policy", `provenance.${index}.allowedUses`, "Record allowedUses kaynak politikasını genişletemez."));
    }
    if (provenance.contentOrigin === "provider_runtime_reference") {
      if (!provenance.exactProviderIdentity) {
        issues.push(issue("dataset_exact_identity_required", `provenance.${index}.exactProviderIdentity`, "Provider runtime reference title benzerliğine düşemez; exact identity zorunludur."));
      }
      const forbidden = forbiddenRetainedFields(provenance);
      if (forbidden.length > 0) {
        issues.push(issue("dataset_provider_text_retained", `provenance.${index}.retainedFields`, `Runtime reference provider metni veya kişisel alan tutamaz: ${forbidden.join(", ")}.`));
      }
    }
  });

  value.records.forEach((record, index) => {
    const provenance = provenanceByRecord.get(record.recordId);
    if (!provenance) {
      issues.push(issue("dataset_provenance_missing", `records.${index}.recordId`, "Her dataset record için provenance zorunludur."));
      return;
    }
    const policy = policies.get(provenance.sourceId);
    if (isTrainingSplit(record.split) && policy && !sourcePolicyAllowsTraining(policy)) {
      const code = policy.licenseStatus === "unresolved"
        ? "dataset_training_license_unresolved"
        : "dataset_training_source_not_allowed";
      issues.push(issue(code, `records.${index}.split`, "Training split yalnız confirmed training_allowed kaynak kullanabilir."));
    }
    if (isTrainingSplit(record.split) && !provenance.allowedUses.includes("training")) {
      issues.push(issue("dataset_training_use_missing", `provenance.${value.provenance.indexOf(provenance)}.allowedUses`, "Training split provenance kaydı training kullanımını açıkça taşımalıdır."));
    }
  });

  const leakageGroups = new Map<string, DatasetSplit>();
  const identities = new Map<string, DatasetSplit>();
  value.records.forEach((record, index) => {
    const existingGroup = leakageGroups.get(record.leakageGroupId);
    if (existingGroup && existingGroup !== record.split) {
      issues.push(issue("dataset_split_leakage", `records.${index}.leakageGroupId`, "Aynı franchise/series leakage group farklı split'lere ayrılamaz."));
    } else {
      leakageGroups.set(record.leakageGroupId, record.split);
    }
    const provenance = provenanceByRecord.get(record.recordId);
    const identity = provenance ? provenanceIdentityKey(provenance) : null;
    if (!identity) return;
    const existingIdentity = identities.get(identity);
    if (existingIdentity && existingIdentity !== record.split) {
      issues.push(issue("dataset_identity_split_leakage", `records.${index}.recordId`, "Aynı exact provider identity farklı split'lere ayrılamaz."));
    } else {
      identities.set(identity, record.split);
    }
  });

  const annotationKeys = new Set<string>();
  value.annotations.forEach((annotation, index) => {
    if (!records.has(annotation.recordId)) {
      issues.push(issue("annotation_record_missing", `annotations.${index}.recordId`, "Annotation mevcut bir dataset record'una bağlı olmalıdır."));
      return;
    }
    if (!value.manifest.aspectIds.includes(annotation.aspectId)) {
      issues.push(issue("annotation_aspect_outside_manifest", `annotations.${index}.aspectId`, "Annotation aspect manifest kapsamına dahil olmalıdır."));
    }
    const key = `${annotation.recordId}:${annotation.aspectId}:${annotation.annotatorId}:${annotation.annotationRound}`;
    if (annotationKeys.has(key)) {
      issues.push(issue("annotation_duplicate", `annotations.${index}`, "Aynı annotator/round için record-aspect annotation tekrarlandı."));
    } else {
      annotationKeys.add(key);
    }
    const summaryLength = records.get(annotation.recordId)?.candidate.shortSummary?.length ?? 0;
    annotation.evidenceSpans.forEach((span, spanIndex) => {
      if (span.end > summaryLength) {
        issues.push(issue("annotation_span_out_of_bounds", `annotations.${index}.evidenceSpans.${spanIndex}`, "Evidence span bounded short summary dışına taşamaz."));
      }
    });
  });

  if (value.manifest.releaseStatus === "publishable") {
    for (const [index, policy] of value.manifest.sourcePolicies.entries()) {
      if (!sourcePolicyAllowsPublication(policy)) {
        issues.push(issue("dataset_publishable_source_forbidden", `manifest.sourcePolicies.${index}`, "Publishable dataset yalnız confirmed ve redistribution/publication izni açık kaynak kullanabilir."));
      }
    }
    for (const [index, provenance] of value.provenance.entries()) {
      if (provenance.reviewStatus !== "approved") {
        issues.push(issue("dataset_publishable_review_required", `provenance.${index}.reviewStatus`, "Publishable dataset provenance reviewStatus=approved olmalıdır."));
      }
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
}
