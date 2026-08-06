import { ASPECT_IDS, ASPECT_REGISTRY, type AspectId } from "../domain/aspect-registry";
import { normalizeTurkishText, tokenizeTurkish } from "./turkish-normalizer";

const TURKISH_SUFFIXES = [
  "dan", "den", "tan", "ten",
  "nın", "nin", "nun", "nün",
  "lık", "lik", "luk", "lük",
  "lar", "ler",
  "yı", "yi", "yu", "yü",
  "ya", "ye",
  "sı", "si", "su", "sü",
  "ın", "in", "un", "ün",
  "lı", "li", "lu", "lü",
  "da", "de", "ta", "te",
  "ı", "i", "u", "ü", "a", "e",
] as const;

interface AliasPattern {
  aspectId: AspectId;
  alias: string;
  tokens: readonly string[];
}

export interface AspectPhraseMatch {
  aspectId: AspectId;
  matchedAlias: string;
  startToken: number;
  endToken: number;
  surfaceTokens: readonly string[];
}

function aliasesFor(id: AspectId): string[] {
  const entry = ASPECT_REGISTRY[id];
  return [...new Set([
    id.replace(/_/g, " "),
    entry.labelTr,
    entry.labelEn,
    ...entry.aliasesTr,
    ...entry.aliasesEn,
  ].map(normalizeTurkishText).filter(Boolean))];
}

const ALIAS_PATTERNS: readonly AliasPattern[] = ASPECT_IDS.flatMap((aspectId) => (
  aliasesFor(aspectId).map((alias) => ({ aspectId, alias, tokens: tokenizeTurkish(alias) }))
)).filter((pattern) => pattern.tokens.length > 0).sort((left, right) => (
  right.tokens.length - left.tokens.length
  || right.alias.length - left.alias.length
  || left.aspectId.localeCompare(right.aspectId, "en")
));

function restoredConsonant(value: string): string[] {
  return value.endsWith("ğ") ? [value, `${value.slice(0, -1)}k`] : [value];
}

export function matchesRegistryToken(surface: string, registryToken: string, allowShort = false): boolean {
  if (surface === registryToken) return true;
  if ((!allowShort && registryToken.length < 4) || registryToken.length < 3 || surface.length <= registryToken.length) return false;
  const queue: { value: string; depth: number }[] = [{ value: surface, depth: 0 }];
  const seen = new Set([surface]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= 3) continue;
    for (const suffix of TURKISH_SUFFIXES) {
      if (!current.value.endsWith(suffix)) continue;
      const stripped = current.value.slice(0, -suffix.length);
      if (stripped.length < Math.max(allowShort ? 3 : 4, registryToken.length - 1)) continue;
      for (const candidate of restoredConsonant(stripped)) {
        if (candidate === registryToken) return true;
        if (!seen.has(candidate)) {
          seen.add(candidate);
          queue.push({ value: candidate, depth: current.depth + 1 });
        }
      }
    }
  }
  return false;
}

function patternMatches(tokens: readonly string[], start: number, pattern: AliasPattern): boolean {
  if (start + pattern.tokens.length > tokens.length) return false;
  return pattern.tokens.every((registryToken, offset) => (
    matchesRegistryToken(tokens[start + offset], registryToken, pattern.tokens.length > 1)
  ));
}

export function matchAspectPhrases(value: string): {
  tokens: readonly string[];
  matches: readonly AspectPhraseMatch[];
} {
  const tokens = tokenizeTurkish(value);
  const matches: AspectPhraseMatch[] = [];
  for (let index = 0; index < tokens.length;) {
    const pattern = ALIAS_PATTERNS.find((candidate) => patternMatches(tokens, index, candidate));
    if (!pattern) {
      index += 1;
      continue;
    }
    matches.push({
      aspectId: pattern.aspectId,
      matchedAlias: pattern.alias,
      startToken: index,
      endToken: index + pattern.tokens.length,
      surfaceTokens: tokens.slice(index, index + pattern.tokens.length),
    });
    index += pattern.tokens.length;
  }
  return { tokens, matches };
}
