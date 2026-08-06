import type { DatasetRecordProvenance, DatasetSourcePolicy } from "./types";

const PROVIDER_TEXT_OR_PERSONAL_FIELDS = new Set([
  "description",
  "synopsis",
  "overview",
  "plot",
  "rawpayload",
  "poster",
  "banner",
  "image",
  "personalnotes",
  "email",
  "uuid",
  "profile",
  "feedback",
  "rawprompt",
  "prompt",
]);

export function sourcePolicyAllowsTraining(policy: DatasetSourcePolicy): boolean {
  return policy.useClass === "training_allowed"
    && policy.licenseStatus === "confirmed"
    && policy.allowedUses.includes("training");
}

export function sourcePolicyAllowsPublication(policy: DatasetSourcePolicy): boolean {
  return policy.licenseStatus === "confirmed"
    && policy.allowedUses.includes("publication")
    && (policy.redistribution === "allowed" || policy.redistribution === "allowed_with_attribution");
}

export function provenanceIdentityKey(provenance: DatasetRecordProvenance): string | null {
  return provenance.exactProviderIdentity?.canonicalKey ?? null;
}

export function forbiddenRetainedFields(provenance: DatasetRecordProvenance): string[] {
  return provenance.retainedFields.filter((field) => (
    PROVIDER_TEXT_OR_PERSONAL_FIELDS.has(field.replace(/[^a-z]/gi, "").toLowerCase())
  ));
}
