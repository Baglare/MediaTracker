import type { AspectId } from "../../domain/aspect-registry";
import type { ResearchSourceId } from "../domain/source-registry";
import { researchSha256 } from "./hash";
import { scorePassageLexicalRelevance } from "./relevance";
import { passageRequiresIsolatedExtraction } from "./security-policy";
import type { ResearchPassageSegment } from "./segmenter";
import type { GroundedResearchPassage, ResearchPassageSelectionReason } from "./types";
import { RESEARCH_PASSAGE_HARD_MAX_CHARACTERS, RESEARCH_PASSAGE_POLICY_VERSION } from "./types";

export interface PassageSelectionDocument {
  documentIndex: number;
  documentId: string;
  citationId: string;
  sourceId: ResearchSourceId;
  language: "en" | "tr";
  pageId: number;
  revisionId: string;
  segments: readonly ResearchPassageSegment[];
}

interface Candidate {
  document: PassageSelectionDocument;
  segment: ResearchPassageSegment;
  lexicalScore: number;
  matchedTerms: readonly string[];
}

interface Selected { candidate: Candidate; reason: ResearchPassageSelectionReason }

function addSelection(input: {
  selected: Selected[];
  seen: Set<string>;
  candidate: Candidate;
  reason: ResearchPassageSelectionReason;
  maxPassages: number;
  maxCharacters: number;
}): boolean {
  const key = `${input.candidate.document.documentId}:${input.candidate.segment.startOffset}:${input.candidate.segment.endOffset}`;
  if (input.seen.has(key) || input.selected.length >= input.maxPassages) return false;
  const characters = input.selected.reduce((total, item) => total + item.candidate.segment.text.length, 0);
  if (characters + input.candidate.segment.text.length > input.maxCharacters) return false;
  input.seen.add(key);
  input.selected.push({ candidate: input.candidate, reason: input.reason });
  return true;
}

function distributedCandidates(candidates: readonly Candidate[], count: number): Candidate[] {
  if (candidates.length === 0 || count <= 0) return [];
  const selected: Candidate[] = [];
  for (let index = 1; index <= count; index += 1) {
    const target = Math.floor((candidates.length - 1) * (index / (count + 1)));
    const candidate = candidates[target];
    if (candidate && !selected.includes(candidate)) selected.push(candidate);
  }
  return selected;
}

export async function selectGroundedResearchPassages(input: {
  aspectId: AspectId;
  documents: readonly PassageSelectionDocument[];
  maxPassages: number;
  maxCharacters: number;
}): Promise<readonly GroundedResearchPassage[]> {
  const candidates: Candidate[] = [];
  for (const document of input.documents) {
    for (const segment of document.segments) {
      if (segment.text.length === 0 || segment.text.length > RESEARCH_PASSAGE_HARD_MAX_CHARACTERS) continue;
      if (passageRequiresIsolatedExtraction(segment.securityFlags)) continue;
      const relevance = scorePassageLexicalRelevance({ text: segment.text, aspectId: input.aspectId });
      candidates.push({ document, segment, lexicalScore: relevance.score, matchedTerms: relevance.matchedTerms });
    }
  }
  candidates.sort((left, right) => left.document.documentIndex - right.document.documentIndex || left.segment.order - right.segment.order);
  const selected: Selected[] = [];
  const seen = new Set<string>();
  const add = (candidate: Candidate, reason: ResearchPassageSelectionReason) => addSelection({
    selected, seen, candidate, reason, maxPassages: input.maxPassages, maxCharacters: input.maxCharacters,
  });

  const leadCandidates = input.documents
    .map((document) => candidates.find((candidate) => candidate.document.documentId === document.documentId))
    .filter((candidate): candidate is Candidate => Boolean(candidate))
    .slice(0, 2);
  for (const candidate of leadCandidates) add(candidate, "lead_coverage");
  const lexical = candidates.filter((candidate) => candidate.lexicalScore > 0)
    .sort((left, right) => right.lexicalScore - left.lexicalScore
      || left.document.documentIndex - right.document.documentIndex
      || left.segment.order - right.segment.order);
  for (const candidate of lexical.slice(0, 4)) add(candidate, "lexical_relevance");
  for (const candidate of distributedCandidates(candidates.filter((candidate) => !seen.has(`${candidate.document.documentId}:${candidate.segment.startOffset}:${candidate.segment.endOffset}`)), 2)) {
    add(candidate, "distributed_coverage");
  }

  const passages = await Promise.all(selected.map(async ({ candidate, reason }) => {
    const textHash = await researchSha256(candidate.segment.text);
    const passageId = await researchSha256([
      candidate.document.sourceId, candidate.document.documentId, candidate.document.revisionId,
      candidate.segment.startOffset, candidate.segment.endOffset, RESEARCH_PASSAGE_POLICY_VERSION,
    ].join("|"));
    return {
      passageId,
      documentId: candidate.document.documentId,
      citationId: candidate.document.citationId,
      sourceId: candidate.document.sourceId,
      language: candidate.document.language,
      pageId: candidate.document.pageId,
      revisionId: candidate.document.revisionId,
      order: candidate.segment.order,
      startOffset: candidate.segment.startOffset,
      endOffset: candidate.segment.endOffset,
      text: candidate.segment.text,
      textHash,
      selectionReason: reason,
      matchedAspectTerms: candidate.matchedTerms,
      securityFlags: candidate.segment.securityFlags,
      retention: "transient_only" as const,
    } satisfies GroundedResearchPassage;
  }));
  return passages.sort((left, right) => {
    const leftDocument = input.documents.find((item) => item.documentId === left.documentId)?.documentIndex ?? 0;
    const rightDocument = input.documents.find((item) => item.documentId === right.documentId)?.documentIndex ?? 0;
    return leftDocument - rightDocument || left.order - right.order;
  });
}
