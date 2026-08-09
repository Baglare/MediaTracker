function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
export type OpenAiExtractionEnvelope = { status: "content"; content: string; model: string; warnings: readonly string[] } | { status: "refusal" | "invalid"; model?: string; warnings: readonly string[] };
export function decodeOpenAiGroundedExtractionEnvelope(value: unknown): OpenAiExtractionEnvelope {
  if (!record(value)) return { status: "invalid", warnings: ["openai_response_not_object"] };
  const model = typeof value.model === "string" && value.model.length <= 120 ? value.model : undefined;
  if (value.status !== "completed" || !Array.isArray(value.output)) return { status: "invalid", ...(model ? { model } : {}), warnings: ["openai_response_incomplete"] };
  const texts: string[] = []; let refusal = false;
  for (const item of value.output) if (record(item) && item.type === "message" && Array.isArray(item.content)) for (const content of item.content) {
    if (!record(content)) continue; if (content.type === "refusal" && typeof content.refusal === "string") refusal = true; if (content.type === "output_text" && typeof content.text === "string") texts.push(content.text);
  }
  if (refusal) return { status: "refusal", ...(model ? { model } : {}), warnings: ["openai_model_refusal"] };
  if (texts.length !== 1 || texts[0].length === 0) return { status: "invalid", ...(model ? { model } : {}), warnings: ["openai_output_text_invalid"] };
  return { status: "content", content: texts[0], model: model ?? "unknown-model", warnings: [] };
}

