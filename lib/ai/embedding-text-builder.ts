import type { AiCandidate, EmbeddingTextPayload } from "@/lib/ai/types";
import {
  inferMediaClassification,
  type MediaItem,
  type MediaType,
} from "@/lib/types";

const MAX_FIELD_LENGTH = 700;
const MAX_NOTES_LENGTH = 400;
const MAX_EMBEDDING_TEXT_LENGTH = 2400;

function cleanText(value: unknown, maxLength = MAX_FIELD_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}...` : cleaned;
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const cleaned = values
    .map((value) => cleanText(value, 80))
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  return Array.from(new Set(cleaned)).sort();
}

function worldFromType(type: MediaType): string {
  if (["anime", "manga", "manhwa", "manhua", "light_novel", "web_novel", "visual_novel"].includes(type)) {
    return "east";
  }
  if (type === "tv" || type === "movie") return "screen";
  return "library";
}

function subTypeFromCandidate(candidate: AiCandidate): string {
  if (candidate.format) return candidate.format;
  return candidate.type;
}

function stableHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function addLine(lines: string[], label: string, value: string | null | undefined): void {
  if (!value) return;
  lines.push(`${label}: ${value}`);
}

function addList(lines: string[], label: string, values: string[]): void {
  if (values.length === 0) return;
  lines.push(`${label}: ${values.join(", ")}`);
}

function finalize(lines: string[], signals: string[]): EmbeddingTextPayload {
  const text = lines.join("\n").slice(0, MAX_EMBEDDING_TEXT_LENGTH).trim();
  return {
    text,
    hash: stableHash(text),
    signals: Array.from(new Set(signals)).sort(),
  };
}

export function buildCandidateEmbeddingText(candidate: AiCandidate): EmbeddingTextPayload {
  const lines: string[] = [];
  const signals: string[] = ["candidate", `type:${candidate.type}`, `world:${worldFromType(candidate.type)}`];
  const genres = cleanList(candidate.genres);
  const authors = cleanList(candidate.authors);
  const overview = cleanText(candidate.overview);
  const format = cleanText(candidate.format, 80);

  addLine(lines, "title", cleanText(candidate.title, 160));
  addLine(lines, "mediaType", candidate.type);
  addLine(lines, "world", worldFromType(candidate.type));
  addLine(lines, "subTypeOrFormat", cleanText(subTypeFromCandidate(candidate), 80));
  addList(lines, "genres", genres);
  addList(lines, "authors", authors);
  addLine(lines, "format", format);
  addLine(lines, "overview", overview);

  if (genres.length > 0) signals.push("genres");
  if (authors.length > 0) signals.push("authors");
  if (overview) signals.push("overview");
  if (format) signals.push("format");

  return finalize(lines, signals);
}

export function buildLibraryItemEmbeddingText(item: MediaItem): EmbeddingTextPayload {
  const classification = inferMediaClassification(item);
  const lines: string[] = [];
  const signals: string[] = [
    "library_item",
    `type:${item.type}`,
    `world:${item.theme || classification.theme}`,
    `mediaType:${item.mediaType || classification.mediaType}`,
    `subType:${item.subType || classification.subType}`,
  ];
  const genres = cleanList(item.genres);
  const tags = cleanList(item.tags);
  const subjects = cleanList(item.subjects);
  const authors = cleanList(item.authors);
  const overview = cleanText(item.overview);
  const personalNotes = cleanText(item.personalNotes, MAX_NOTES_LENGTH);
  const format = cleanText(item.format, 80);

  addLine(lines, "title", cleanText(item.title, 160));
  addLine(lines, "mediaType", item.type);
  addLine(lines, "world", item.theme || classification.theme);
  addLine(lines, "classificationType", item.mediaType || classification.mediaType);
  addLine(lines, "subType", item.subType || classification.subType);
  addLine(lines, "subTypeOrFormat", format || item.subType || classification.subType);
  addList(lines, "genres", genres);
  addList(lines, "tags", tags);
  addList(lines, "subjects", subjects);
  addList(lines, "authors", authors);
  addLine(lines, "overview", overview);
  addLine(lines, "personalNotes", personalNotes);

  if (genres.length > 0) signals.push("genres");
  if (tags.length > 0) signals.push("tags");
  if (subjects.length > 0) signals.push("subjects");
  if (authors.length > 0) signals.push("authors");
  if (overview) signals.push("overview");
  if (personalNotes) signals.push("personalNotes");
  if (format) signals.push("format");

  return finalize(lines, signals);
}
