import { getResearchSource } from "../../domain/source-registry";
import type { GroundedResearchPacket, GroundedResearchPassage } from "../../passages/types";
import { researchSha256 } from "../../passages/hash";
import { passageRequiresIsolatedExtraction } from "../../passages/security-policy";
import {
  GROUNDED_EVIDENCE_UNIT_HARD_MAX_CHARACTERS,
  GROUNDED_EVIDENCE_UNIT_POLICY_VERSION,
  GROUNDED_EVIDENCE_UNIT_TARGET_MAX_CHARACTERS,
  GROUNDED_EVIDENCE_UNIT_TARGET_MIN_CHARACTERS,
  type GroundedEvidenceUnit,
} from "./types";

function sentenceChunks(text: string): string[] {
  const sentences = [...text.matchAll(/[^.!?。！？]+(?:[.!?。！？]+["'”’\])}]*)?/gu)].map((match) => match[0].trim()).filter(Boolean);
  const source = sentences.length > 0 ? sentences : [text.trim()];
  const chunks: string[] = [];
  for (const sentence of source) {
    if (sentence.length <= GROUNDED_EVIDENCE_UNIT_HARD_MAX_CHARACTERS) { chunks.push(sentence); continue; }
    let remaining = sentence;
    while (remaining.length > GROUNDED_EVIDENCE_UNIT_HARD_MAX_CHARACTERS) {
      const window = remaining.slice(0, GROUNDED_EVIDENCE_UNIT_TARGET_MAX_CHARACTERS + 1);
      const cut = Math.max(window.lastIndexOf(";"), window.lastIndexOf(","), window.lastIndexOf(" "));
      const end = cut >= GROUNDED_EVIDENCE_UNIT_TARGET_MIN_CHARACTERS ? cut + 1 : GROUNDED_EVIDENCE_UNIT_TARGET_MAX_CHARACTERS;
      chunks.push(remaining.slice(0, end).trim()); remaining = remaining.slice(end).trim();
    }
    if (remaining) chunks.push(remaining);
  }
  const merged: string[] = [];
  for (const chunk of chunks) {
    const previous = merged.at(-1);
    if (previous && previous.length < GROUNDED_EVIDENCE_UNIT_TARGET_MIN_CHARACTERS && previous.length + 1 + chunk.length <= GROUNDED_EVIDENCE_UNIT_TARGET_MAX_CHARACTERS) merged[merged.length - 1] = `${previous} ${chunk}`;
    else merged.push(chunk);
  }
  return merged.filter((chunk) => chunk.length > 0 && chunk.length <= GROUNDED_EVIDENCE_UNIT_HARD_MAX_CHARACTERS);
}

async function unitsForPassage(packet: GroundedResearchPacket, passage: GroundedResearchPassage): Promise<GroundedEvidenceUnit[]> {
  const source = getResearchSource(passage.sourceId);
  const publisherGroup = source?.sourceClass === "encyclopedia" ? "wikimedia-encyclopedia" : passage.sourceId;
  return Promise.all(sentenceChunks(passage.text).map(async (text, unitOrder) => {
    const textHash = await researchSha256(text);
    const unitId = await researchSha256([packet.packetContentHash, passage.passageId, unitOrder, textHash, GROUNDED_EVIDENCE_UNIT_POLICY_VERSION].join("|"));
    return { unitId, passageId: passage.passageId, citationId: passage.citationId, sourceId: passage.sourceId, publisherGroup, language: passage.language, passageOrder: passage.order, unitOrder, text, textHash, securityFlags: passage.securityFlags, retention: "transient_only" as const };
  }));
}

export async function buildGroundedEvidenceUnits(input: { packet: GroundedResearchPacket; maxUnits: number }): Promise<{ units: readonly GroundedEvidenceUnit[]; eligibleUnits: readonly GroundedEvidenceUnit[]; excludedUnitIds: readonly string[] }> {
  const output: GroundedEvidenceUnit[] = [];
  for (const passage of input.packet.passages) {
    for (const unit of await unitsForPassage(input.packet, passage)) {
      if (output.length >= input.maxUnits) break;
      output.push(unit);
    }
    if (output.length >= input.maxUnits) break;
  }
  const eligibleUnits = output.filter((unit) => !passageRequiresIsolatedExtraction(unit.securityFlags));
  return { units: output, eligibleUnits, excludedUnitIds: output.filter((unit) => !eligibleUnits.includes(unit)).map((unit) => unit.unitId) };
}

