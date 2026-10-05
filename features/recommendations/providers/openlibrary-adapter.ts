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
