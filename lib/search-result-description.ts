export const SEARCH_RESULT_DESCRIPTION_MAX_CHARS = 2_000;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
};

export function normalizeSearchResultDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const withoutExecutableBlocks = value
    .replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  const decoded = withoutExecutableBlocks.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_entity, body: string) => {
    if (body[0] === "#") {
      const codePoint = body[1]?.toLowerCase() === "x" ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : " ";
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? " ";
  });
  const normalized = decoded.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, SEARCH_RESULT_DESCRIPTION_MAX_CHARS) : undefined;
}
