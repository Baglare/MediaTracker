import type { GroundedResearchPacket, ResearchPassageSelectionReason } from "../../passages/types";
import {
  GROUNDED_EXTRACTION_WORKING_SET_MAX_CHARACTERS,
  GROUNDED_EXTRACTION_WORKING_SET_MAX_UNITS,
  type GroundedEvidenceUnit,
} from "../domain/types";

const REASON_PRIORITY: Readonly<Record<ResearchPassageSelectionReason, number>> = {
  lexical_relevance: 0,
  lead_coverage: 1,
  distributed_coverage: 2,
};

export interface GroundedEvidenceWorkingSet {
  units: readonly GroundedEvidenceUnit[];
  packetUnitCount: number;
  sentUnitCount: number;
  packetCharacters: number;
  sentCharacters: number;
  lexicalUnitsRetained: number;
  contextUnitsRetained: number;
}

export function buildGroundedEvidenceWorkingSet(input: {
  packet: GroundedResearchPacket;
  eligibleUnits: readonly GroundedEvidenceUnit[];
  maxUnits?: number;
  maxCharacters?: number;
}): GroundedEvidenceWorkingSet {
  const maxUnits = Math.min(GROUNDED_EXTRACTION_WORKING_SET_MAX_UNITS, Math.max(1, input.maxUnits ?? GROUNDED_EXTRACTION_WORKING_SET_MAX_UNITS));
  const maxCharacters = Math.min(GROUNDED_EXTRACTION_WORKING_SET_MAX_CHARACTERS, Math.max(1, input.maxCharacters ?? GROUNDED_EXTRACTION_WORKING_SET_MAX_CHARACTERS));
  const passageById = new Map(input.packet.passages.map((passage) => [passage.passageId, passage]));
  const groups = [...new Set(input.eligibleUnits.map((unit) => unit.passageId))].map((passageId) => ({
    passageId,
    passage: passageById.get(passageId),
    units: input.eligibleUnits.filter((unit) => unit.passageId === passageId).sort((a, b) => a.unitOrder - b.unitOrder),
  })).filter((group): group is typeof group & { passage: NonNullable<typeof group.passage> } => Boolean(group.passage));
  groups.sort((a, b) => REASON_PRIORITY[a.passage.selectionReason] - REASON_PRIORITY[b.passage.selectionReason] || a.passage.order - b.passage.order || a.passageId.localeCompare(b.passageId));

  const selected: GroundedEvidenceUnit[] = [];
  let sentCharacters = 0;
  for (const group of groups) {
    for (const unit of group.units) {
      if (selected.length >= maxUnits || sentCharacters + unit.text.length > maxCharacters) break;
      selected.push(unit);
      sentCharacters += unit.text.length;
    }
    if (selected.length >= maxUnits || sentCharacters >= maxCharacters) break;
  }
  selected.sort((a, b) => a.passageOrder - b.passageOrder || a.unitOrder - b.unitOrder || a.unitId.localeCompare(b.unitId));
  return {
    units: selected,
    packetUnitCount: input.eligibleUnits.length,
    sentUnitCount: selected.length,
    packetCharacters: input.eligibleUnits.reduce((total, unit) => total + unit.text.length, 0),
    sentCharacters,
    lexicalUnitsRetained: selected.filter((unit) => passageById.get(unit.passageId)?.selectionReason === "lexical_relevance").length,
    contextUnitsRetained: selected.filter((unit) => passageById.get(unit.passageId)?.selectionReason === "lead_coverage").length,
  };
}
