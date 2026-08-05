import type { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { createVerifiedCandidateIdentity } from "./candidate-identity";
import { mapProviderMetadataClaim, mapProviderSubjectClaims } from "./evidence-mappers";
import type { CandidateProviderEvidenceSnapshot, SecondaryIdentity } from "./types";
import { PROVIDER_EVIDENCE_SCHEMA_VERSION } from "./types";

export function adaptOpenLibraryEvidence(result: OpenLibraryNormalizedResult, fetchedAt = new Date().toISOString()): CandidateProviderEvidenceSnapshot {
  const workId = result.workId || result.externalId;
  const secondaryIds: SecondaryIdentity[] = [{ kind: "openlibrary_work", externalId: workId }];
  if (result.editionId) secondaryIds.push({ kind: "openlibrary_edition", externalId: result.editionId });
  const identity = createVerifiedCandidateIdentity({ primaryProvider: "openlibrary", primaryExternalId: workId, mediaType: "book", secondaryIds });
  return {
    schemaVersion: PROVIDER_EVIDENCE_SCHEMA_VERSION, candidateIdentity: identity,
    objectiveMetadata: { mediaType: "book", releaseYear: result.releaseYear, language: result.languages?.[0], pageCount: result.pageCount, subjects: result.subjects },
    rawEvidenceClaims: [
      ...mapProviderSubjectClaims("openlibrary", result.subjects, 0.55),
      ...(result.pageCount ? [mapProviderMetadataClaim({ provider: "openlibrary", field: "pageCount", value: result.pageCount, reliability: 0.8 })] : []),
    ],
    providerCoverage: { openlibrary: result.overview ? "available" : "partial" },
    missingFields: [!result.subjects?.length && "subjects", !result.overview && "description", !result.pageCount && "pageCount"].filter((x): x is string => Boolean(x)),
    fetchedAt, cacheStatus: "not_cacheable", warnings: ["openlibrary_subject_is_not_aspect_strength"],
  };
}

interface OpenLibraryWorkResponse {
  key?: string;
  description?: string | { value?: string };
  subjects?: string[];
}

export async function fetchOpenLibraryWorkEvidence(input: {
  result: OpenLibraryNormalizedResult;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<CandidateProviderEvidenceSnapshot> {
  const base = adaptOpenLibraryEvidence(input.result);
  const workId = input.result.workId || input.result.externalId;
  if (!/^\/works\/OL[A-Za-z0-9]+W$/.test(workId)) throw new Error("openlibrary_work_id_invalid");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 2500);
  try {
    const response = await (input.fetchImpl ?? fetch)(`https://openlibrary.org${workId}.json`, {
      headers: { accept: "application/json" }, signal: controller.signal,
    });
    if (!response.ok) throw new Error(`openlibrary_evidence_unavailable:${response.status}`);
    const work = (await response.json()) as OpenLibraryWorkResponse;
    const description = typeof work.description === "string" ? work.description : work.description?.value;
    const descriptionClaim = description?.trim()
      ? mapProviderMetadataClaim({ provider: "openlibrary", field: "description", value: description.trim().slice(0, 1000), reliability: 0.55 })
      : null;
    return {
      ...base,
      rawEvidenceClaims: descriptionClaim ? [...base.rawEvidenceClaims, descriptionClaim] : base.rawEvidenceClaims,
      missingFields: base.missingFields.filter((field) => field !== "description" || !descriptionClaim),
      providerCoverage: { openlibrary: descriptionClaim ? "available" : "partial" },
      warnings: [...base.warnings, "openlibrary_description_requires_d6_3_semantic_mapping"],
    };
  } finally {
    clearTimeout(timeout);
  }
}
