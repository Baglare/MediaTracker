const APOSTROPHES = /[\u2018\u2019\u02BC\u0060\u00B4]/g;

export function normalizeTurkishText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replace(APOSTROPHES, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeTurkish(value: string): string[] {
  const normalized = normalizeTurkishText(value);
  if (!normalized) return [];
  return normalized
    .split(/\s+/u)
    .map((token) => token.replace(/'/g, ""))
    .filter(Boolean);
}
