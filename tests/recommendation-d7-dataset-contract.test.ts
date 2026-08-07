import { describe, expect, it } from "vitest";
import {
  decodeAspectAnnotationRecord,
  decodeAspectVerifierOutput,
  decodeCandidateTextBundle,
  decodeDatasetManifest,
  decodeDatasetPackage,
} from "@/features/recommendations/evaluation/dataset";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";

const at = "2026-08-06T00:00:00.000Z";

function sourcePolicy(overrides: Record<string, unknown> = {}) {
  return {
    sourceId: "synthetic_source",
    sourceType: "synthetic",
    useClass: "training_allowed",
    allowedUses: ["annotation", "evaluation", "training", "internal_research"],
    licenseStatus: "confirmed",
    attribution: { required: false },
    retention: { mode: "indefinite", deleteOnRevocation: true },
    redistribution: "internal_only",
    notes: ["D7 synthetic fixture policy."],
    ...overrides,
  };
}

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    datasetId: "d7_contract_fixture",
    createdAt: at,
    updatedAt: at,
    purpose: "D7 saf codec contract testi.",
    schemaVersion: 1,
    aspectIds: ["romance", "fantasy"],
    mediaTypes: ["anime"],
    recordCount: 1,
    sourcePolicies: [sourcePolicy()],
    splitPolicy: {
      strategy: "franchise_group_aware",
      trainPercent: 70,
      validationPercent: 15,
      testPercent: 15,
      groupKeys: ["leakageGroupId", "exactProviderIdentity"],
      holdout: "none",
      goldTestFrozen: true,
    },
    annotationPolicyVersion: "d7_annotation_v1",
    licenseAuditVersion: "d7_license_v1",
    contentHash: `sha256:${"a".repeat(64)}`,
    releaseStatus: "internal_only",
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    title: "Synthetic Work A",
    shortSummary: "İki karakterin ilişkisi ana çatışmayı ve çözümü belirler.",
    summaryOrigin: "synthetic",
    genres: ["Romance"],
    tags: [{ name: "Romance", rank: 70 }],
    keywords: ["relationship"],
    format: "TV",
    status: "finished",
    language: "tr",
    country: "TR",
    providerCoverage: {},
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    recordId: "record_001",
    split: "train",
    leakageGroupId: "franchise_001",
    candidate: candidate(),
    ...overrides,
  };
}

function provenance(overrides: Record<string, unknown> = {}) {
  return {
    recordId: "record_001",
    sourceId: "synthetic_source",
    sourceType: "synthetic",
    sourceReference: "synthetic:d7-contract-fixture-001",
    capturedAt: at,
    contentOrigin: "synthetic",
    allowedUses: ["annotation", "evaluation", "training", "internal_research"],
    attribution: { required: false },
    licenseEvidence: ["project-policy:d7-synthetic-v1"],
    retainedFields: ["shortSummary", "genres", "tags"],
    excludedFields: ["personalNotes", "rawPrompt", "providerPayload"],
    transformationNotes: ["Tamamen sentetik mini senaryo."],
    containsPersonalData: false,
    reviewer: "rev_internal_01",
    reviewStatus: "approved",
    ...overrides,
  };
}

function annotation(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    annotationId: "annotation_001",
    recordId: "record_001",
    aspectId: "romance",
    label: "primary",
    confidence: "high",
    evidenceSpans: [],
    evidenceNotes: ["İlişki, sentetik anlatının ana çatışmasını belirliyor."],
    contradictionNotes: [],
    annotatorId: "ann_internal_01",
    annotationRound: 1,
    createdAt: at,
    guidelineVersion: "d7_annotation_v1",
    labelSource: "synthetic_contract",
    assistanceMode: "unknown_legacy",
    adjudicationStatus: "not_required",
    ...overrides,
  };
}

function datasetPackage(overrides: Record<string, unknown> = {}) {
  return {
    manifest: manifest(),
    records: [record()],
    provenance: [provenance()],
    annotations: [annotation()],
    ...overrides,
  };
}

function verifierOutput(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    aspectId: "romance",
    probabilities: { absent: 0.05, incidental: 0.1, significant: 0.2, primary: 0.65 },
    predictedLevel: "primary",
    calibratedConfidence: 0.77,
    abstained: false,
    modelVersion: "aspect-verifier-v0.1.0",
    inputSchemaVersion: 1,
    warnings: [],
    ...overrides,
  };
}

describe("D7 dataset manifest/provenance contract", () => {
  it("valid manifest ve package'i kabul eder", () => {
    expect(decodeDatasetManifest(manifest())).toMatchObject({ ok: true });
    expect(decodeDatasetPackage(datasetPackage())).toMatchObject({ ok: true });
  });

  it("provenance olmayan record'u reddeder", () => {
    expect(decodeDatasetPackage(datasetPackage({ provenance: [] }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "dataset_provenance_missing" })]),
    });
  });

  it("unresolved license kaynağını training split'te reddeder", () => {
    const unresolvedPolicy = sourcePolicy({
      useClass: "prohibited_or_unresolved",
      allowedUses: ["annotation", "evaluation"],
      licenseStatus: "unresolved",
    });
    expect(decodeDatasetPackage(datasetPackage({
      manifest: manifest({ sourcePolicies: [unresolvedPolicy] }),
      provenance: [provenance({ allowedUses: ["annotation", "evaluation"] })],
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "dataset_training_license_unresolved" })]),
    });
  });

  it("internal_only policy ile publishable manifest'i ayırır", () => {
    expect(decodeDatasetPackage(datasetPackage({ manifest: manifest({ releaseStatus: "publishable" }) }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "dataset_publishable_source_forbidden" })]),
    });
    const publishablePolicy = sourcePolicy({
      allowedUses: ["annotation", "evaluation", "training", "internal_research", "publication"],
      redistribution: "allowed",
    });
    expect(decodeDatasetPackage(datasetPackage({
      manifest: manifest({ releaseStatus: "publishable", sourcePolicies: [publishablePolicy] }),
      provenance: [provenance({ allowedUses: ["annotation", "evaluation", "training", "internal_research", "publication"] })],
    }))).toMatchObject({ ok: true });
  });

  it("personal data flag true olduğunda fail-closed davranır", () => {
    expect(decodeDatasetPackage(datasetPackage({ provenance: [provenance({ containsPersonalData: true })] }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "dataset_personal_data_forbidden" })]),
    });
  });

  it("provider runtime reference için exact identity zorunlu kılar", () => {
    const providerPolicy = sourcePolicy({
      sourceId: "anilist_runtime",
      sourceType: "provider_api",
      useClass: "runtime_only",
      allowedUses: ["runtime_reference", "annotation"],
      licenseStatus: "conditional",
      redistribution: "prohibited",
      retention: { mode: "bounded", maxDays: 30, deleteOnRevocation: true },
    });
    const providerProvenance = provenance({
      sourceId: "anilist_runtime",
      sourceType: "provider_api",
      sourceReference: "anilist:anime:101",
      contentOrigin: "provider_runtime_reference",
      allowedUses: ["runtime_reference", "annotation"],
      retainedFields: ["providerIdentity", "genres", "tags"],
    });
    const base = datasetPackage({
      manifest: manifest({ sourcePolicies: [providerPolicy] }),
      records: [record({ split: "pilot" })],
      provenance: [providerProvenance],
    });
    expect(decodeDatasetPackage(base)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "dataset_exact_identity_required" })]),
    });
    expect(decodeDatasetPackage({
      ...base,
      provenance: [{
        ...providerProvenance,
        exactProviderIdentity: createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "101", mediaType: "anime" }),
      }],
    })).toMatchObject({ ok: true });
  });

  it("aynı franchise leakage group'unu farklı split'lerde reddeder", () => {
    expect(decodeDatasetPackage(datasetPackage({
      manifest: manifest({ recordCount: 2 }),
      records: [record(), record({ recordId: "record_002", split: "test" })],
      provenance: [provenance(), provenance({ recordId: "record_002", sourceReference: "synthetic:d7-contract-fixture-002" })],
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "dataset_split_leakage" })]),
    });
  });

  it("candidate bundle'da kişisel alan ve malformed payload kabul etmez", () => {
    expect(decodeCandidateTextBundle({ ...candidate(), userRating: 9 })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "dataset_unknown_field" })]),
    });
    expect(decodeDatasetPackage({ ...datasetPackage(), unexpected: true })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "dataset_unknown_field" })]),
    });
  });
});

describe("D7 aspect annotation contract", () => {
  it("invalid annotation label'i reddeder", () => {
    expect(decodeAspectAnnotationRecord(annotation({ label: "unknown" }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "annotation_label_invalid" })]),
    });
  });

  it("insufficient_evidence değerini absent'e dönüştürmez", () => {
    const decoded = decodeAspectAnnotationRecord(annotation({ label: "insufficient_evidence", confidence: "low" }));
    expect(decoded).toMatchObject({ ok: true, value: { label: "insufficient_evidence" } });
    if (decoded.ok) expect(decoded.value.label).not.toBe("absent");
  });

  it("aynı annotator/round duplicate annotation'ı reddeder", () => {
    expect(decodeDatasetPackage(datasetPackage({
      annotations: [annotation(), annotation({ annotationId: "annotation_002" })],
    }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "annotation_duplicate" })]),
    });
  });

  it("finalLabel'i yalnız resolved adjudication sonrasında kabul eder", () => {
    expect(decodeAspectAnnotationRecord(annotation({ adjudicationStatus: "pending", finalLabel: "significant" }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "annotation_final_label_forbidden" })]),
    });
    expect(decodeAspectAnnotationRecord(annotation({ adjudicationStatus: "resolved", finalLabel: "significant" }))).toMatchObject({ ok: true });
  });
});

describe("D7 AspectVerifierOutput codec", () => {
  it("valid ordinal output ve model version'ı kabul eder", () => {
    expect(decodeAspectVerifierOutput(verifierOutput())).toMatchObject({
      ok: true,
      value: { aspectId: "romance", predictedLevel: "primary", modelVersion: "aspect-verifier-v0.1.0" },
    });
  });

  it("invalid probability ve toplamı reddeder", () => {
    expect(decodeAspectVerifierOutput(verifierOutput({ probabilities: { absent: -0.1, incidental: 0.1, significant: 0.2, primary: 0.8 } }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "verifier_probability_invalid" })]),
    });
    expect(decodeAspectVerifierOutput(verifierOutput({ probabilities: { absent: 0.1, incidental: 0.1, significant: 0.2, primary: 0.5 } }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "verifier_probability_sum_invalid" })]),
    });
  });

  it("probability sum toleransını uygular", () => {
    expect(decodeAspectVerifierOutput(verifierOutput({ probabilities: { absent: 0.1, incidental: 0.2, significant: 0.3, primary: 0.40005 } }))).toMatchObject({ ok: true });
  });

  it("abstention'ı unknown/absent'ten ayrı tutar", () => {
    expect(decodeAspectVerifierOutput(verifierOutput({
      predictedLevel: null,
      calibratedConfidence: 0.31,
      abstained: true,
      abstentionReason: "insufficient_evidence",
    }))).toMatchObject({ ok: true, value: { abstained: true, predictedLevel: null } });
    expect(decodeAspectVerifierOutput(verifierOutput({ predictedLevel: null }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "verifier_prediction_invalid" })]),
    });
  });

  it("unknown aspect ID ve mock/hash model version'ı reddeder", () => {
    expect(decodeAspectVerifierOutput(verifierOutput({ aspectId: "not_registered" }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "verifier_aspect_unknown" })]),
    });
    expect(decodeAspectVerifierOutput(verifierOutput({ modelVersion: "local-mock-v1" }))).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "verifier_model_forbidden" })]),
    });
  });
});
