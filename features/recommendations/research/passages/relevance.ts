import { ASPECT_REGISTRY, type AspectId } from "../../domain/aspect-registry";

const SUPPLEMENTAL_TERMS: Readonly<Partial<Record<AspectId, readonly string[]>>> = {
  romance: ["romantic relationship", "love interest", "couple"],
  political_intrigue: ["political power", "power struggle", "government conspiracy"],
  character_driven: ["character development", "personal journey", "interpersonal conflict"],
  love_triangle: ["romantic triangle", "competing love interests"],
};

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

function phrasePresent(text: string, term: string): boolean {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped(term)}(?:$|[^\\p{L}\\p{N}])`, "u").test(text);
}

export function buildAspectResearchLexicon(aspectId: AspectId): readonly string[] {
  const aspect = ASPECT_REGISTRY[aspectId];
  return [...new Set([aspect.labelEn, ...aspect.aliasesEn, ...(SUPPLEMENTAL_TERMS[aspectId] ?? [])]
    .map(normalized).filter((term) => term.length > 1 && term.length <= 80))].slice(0, 24);
}

export function scorePassageLexicalRelevance(input: { text: string; aspectId: AspectId }): { score: number; matchedTerms: readonly string[] } {
  const text = normalized(input.text);
  const lexicon = buildAspectResearchLexicon(input.aspectId);
  const matchedTerms = lexicon.filter((term) => phrasePresent(text, term));
  const label = normalized(ASPECT_REGISTRY[input.aspectId].labelEn);
  const aliases = new Set(ASPECT_REGISTRY[input.aspectId].aliasesEn.map(normalized));
  const score = matchedTerms.reduce((total, term) => total + (term === label ? 4 : aliases.has(term) ? 3 : 2), 0);
  return { score, matchedTerms };
}

