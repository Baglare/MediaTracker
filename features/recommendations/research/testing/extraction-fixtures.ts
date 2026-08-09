import type { AspectId } from "../../domain/aspect-registry";
import { createResearchVersionScope } from "../domain/version-scope";
import { buildGroundedResearchPacket } from "../passages/packet-builder";
import type { GroundedResearchPacket } from "../passages/types";
import { buildGroundedAspectDefinition } from "../extraction/domain/provenance";
import { GROUNDED_EXTRACTION_POLICY_VERSION, GROUNDED_EXTRACTION_SCHEMA_VERSION, type GroundedExtractionRequest } from "../extraction/domain/types";
import { r3aCandidateIdentity } from "./acquisition-fixtures";

export const SYNTHETIC_SIGNIFICANT_ROMANCE = "Two fictional lead characters openly develop mutual romantic feelings. Their relationship repeatedly affects their critical decisions and changes the direction of the central conflict.";
export const SYNTHETIC_NO_ROMANCE = "The students compete through escalating gambling matches at an elite school. The passage describes rules, rivalries, debts, and strategic risks without making any statement about romantic relationships.";
export const SYNTHETIC_EXPLICIT_ABSENCE = "The fictional work explicitly contains no romantic relationship and no romantic subplot; its story remains focused on professional rivalry.";

export async function createGroundedExtractionPacket(input: { text?: string; aspectId?: AspectId; revisionId?: string; title?: string } = {}): Promise<GroundedResearchPacket> {
  const candidateIdentity = r3aCandidateIdentity(); const versionScope = createResearchVersionScope({ identity: candidateIdentity, scopeKind: "work" });
  const revisionId = input.revisionId ?? "9001"; const sourceHash = `sha256:${"c".repeat(64)}`;
  const built = await buildGroundedResearchPacket({ candidateIdentity, versionScope, aspectId: input.aspectId ?? "romance", role: "must", minimumLevel: "significant", documents: [{ documentId: `wikipedia:42:${revisionId}:fixture`, sourceId: "wikipedia", canonicalUrl: "https://en.wikipedia.org/wiki/Fictional_work", language: "en", wikidataEntityId: "Q123", pageId: 42, revisionId, title: input.title ?? "Private fixture title", text: input.text ?? SYNTHETIC_SIGNIFICANT_ROMANCE, citation: { citationId: `wikipedia:42:${revisionId}`, sourceId: "wikipedia", canonicalUrl: `https://en.wikipedia.org/w/index.php?title=Fictional_work&oldid=${revisionId}`, revisionId, accessedAt: "2026-08-09T00:00:00.000Z", sourceContentHash: sourceHash, attribution: "Wikipedia contributors, fictional fixture", licenseClass: "cc_by_sa" } }], maxPassages: 8, maxPacketCharacters: 10_000, acquisitionPolicyVersion: "d7-r3a.acquire.1", now: () => new Date("2026-08-09T00:00:00.000Z") });
  if (built.status !== "packet_ready") throw new Error(`fixture_packet_${built.status}`); return built.packet;
}

export async function createGroundedExtractionRequest(overrides: Partial<GroundedExtractionRequest> = {}): Promise<GroundedExtractionRequest> {
  const packet = overrides.packet ?? await createGroundedExtractionPacket();
  return { version: 1, packet, aspectDefinition: buildGroundedAspectDefinition(packet.aspectId), extractorPolicyVersion: GROUNDED_EXTRACTION_POLICY_VERSION, schemaVersion: GROUNDED_EXTRACTION_SCHEMA_VERSION, requestId: "d7-r3b-fixture", maxEvidenceUnits: 64, maxOutputAssessments: 8, ...overrides };
}

