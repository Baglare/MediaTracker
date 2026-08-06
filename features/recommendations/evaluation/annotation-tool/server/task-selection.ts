import { isAspectId, type AspectId } from "../../../domain/aspect-registry";

import type { TaskGenerationSelection } from "./workflows";

export const MAX_EXPLICIT_TASK_PAIRS = 1000;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

export function decodeTaskGenerationSelection(raw: unknown): TaskGenerationSelection | null {
  if (!object(raw) || typeof raw.mode !== "string"
    || !["all_selected", "aspect_group", "explicit", "aspect_ids"].includes(raw.mode)) return null;
  if (raw.mode !== "explicit") return raw as unknown as TaskGenerationSelection;
  if (!exactFields(raw, ["mode", "pairs"]) || !Array.isArray(raw.pairs) || raw.pairs.length > MAX_EXPLICIT_TASK_PAIRS) return null;

  const seen = new Set<string>();
  const pairs: { recordId: string; aspectId: AspectId }[] = [];
  for (const pair of raw.pairs) {
    if (!object(pair) || !exactFields(pair, ["recordId", "aspectId"])
      || typeof pair.recordId !== "string" || !isAspectId(pair.aspectId)) return null;
    const key = `${pair.recordId}|${pair.aspectId}`;
    if (seen.has(key)) return null;
    seen.add(key);
    pairs.push({ recordId: pair.recordId, aspectId: pair.aspectId });
  }
  return { mode: "explicit", pairs };
}
