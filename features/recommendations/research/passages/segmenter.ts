import { inspectResearchPassageSecurity } from "./security-policy";
import {
  RESEARCH_PASSAGE_HARD_MAX_CHARACTERS,
  RESEARCH_PASSAGE_TARGET_MAX_CHARACTERS,
  RESEARCH_PASSAGE_TARGET_MIN_CHARACTERS,
  type ResearchPassageSecurityFlag,
} from "./types";

export interface ResearchPassageSegment {
  order: number;
  startOffset: number;
  endOffset: number;
  text: string;
  securityFlags: readonly ResearchPassageSecurityFlag[];
}

interface Span { start: number; end: number }

function trimSpan(text: string, start: number, end: number): Span | null {
  while (start < end && /\s/u.test(text[start])) start += 1;
  while (end > start && /\s/u.test(text[end - 1])) end -= 1;
  return start < end ? { start, end } : null;
}

function paragraphSpans(text: string): Span[] {
  const spans: Span[] = [];
  let start = 0;
  while (start < text.length) {
    while (text.startsWith("\n\n", start)) start += 2;
    if (start >= text.length) break;
    const separator = text.indexOf("\n\n", start);
    const end = separator < 0 ? text.length : separator;
    const span = trimSpan(text, start, end);
    if (span) spans.push(span);
    start = separator < 0 ? text.length : separator + 2;
  }
  return spans;
}

function sentenceSpans(text: string, paragraph: Span): Span[] {
  const source = text.slice(paragraph.start, paragraph.end);
  const spans: Span[] = [];
  const pattern = /[^.!?。！？]+(?:[.!?。！？]+["'”’\])}]*)?/gu;
  for (const match of source.matchAll(pattern)) {
    const localStart = match.index ?? 0;
    const span = trimSpan(text, paragraph.start + localStart, paragraph.start + localStart + match[0].length);
    if (span) spans.push(span);
  }
  return spans.length > 0 ? spans : [paragraph];
}

function boundedSpans(text: string): Span[] {
  const output: Span[] = [];
  for (const paragraph of paragraphSpans(text)) {
    if (paragraph.end - paragraph.start <= RESEARCH_PASSAGE_TARGET_MAX_CHARACTERS) {
      output.push(paragraph);
      continue;
    }
    let current: Span | null = null;
    for (const sentence of sentenceSpans(text, paragraph)) {
      if (!current) current = sentence;
      else if (sentence.end - current.start <= RESEARCH_PASSAGE_TARGET_MAX_CHARACTERS) current = { start: current.start, end: sentence.end };
      else { output.push(current); current = sentence; }
    }
    if (current) output.push(current);
  }
  return output;
}

function mergeShortSpans(text: string, spans: readonly Span[]): Span[] {
  const merged: Span[] = [];
  for (let index = 0; index < spans.length; index += 1) {
    let current = spans[index];
    while (current.end - current.start < RESEARCH_PASSAGE_TARGET_MIN_CHARACTERS && index + 1 < spans.length) {
      const next = spans[index + 1];
      if (next.end - current.start > RESEARCH_PASSAGE_TARGET_MAX_CHARACTERS) break;
      current = { start: current.start, end: next.end };
      index += 1;
    }
    merged.push(current);
  }
  return merged;
}

export function segmentResearchDocument(text: string): readonly ResearchPassageSegment[] {
  return mergeShortSpans(text, boundedSpans(text)).map((span, order) => {
    const passageText = text.slice(span.start, span.end);
    const flags = new Set(inspectResearchPassageSecurity(passageText));
    if (passageText.length > RESEARCH_PASSAGE_HARD_MAX_CHARACTERS) flags.add("oversized_fragment");
    return { order, startOffset: span.start, endOffset: span.end, text: passageText, securityFlags: [...flags].sort() };
  });
}

