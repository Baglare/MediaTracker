function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
export type ChatExtractionEnvelope = { status: "content"; content: string; model: string; warnings: readonly string[] } | { status: "refusal" | "invalid"; model?: string; warnings: readonly string[] };
export function decodeChatExtractionEnvelope(value: unknown): ChatExtractionEnvelope {
  if (!record(value)) return { status: "invalid", warnings: ["chat_response_not_object"] };
  const model = typeof value.model === "string" && value.model.length <= 120 ? value.model : undefined;
  if (!Array.isArray(value.choices) || value.choices.length !== 1 || !record(value.choices[0])) return { status: "invalid", ...(model ? { model } : {}), warnings: ["chat_choices_invalid"] };
  const choice = value.choices[0]; if (!record(choice.message)) return { status: "invalid", ...(model ? { model } : {}), warnings: ["chat_message_invalid"] };
  if ((typeof choice.message.refusal === "string" && choice.message.refusal.length > 0) || choice.finish_reason === "content_filter") return { status: "refusal", ...(model ? { model } : {}), warnings: ["chat_model_refusal"] };
  if (typeof choice.message.content !== "string" || choice.message.content.length === 0) return { status: "invalid", ...(model ? { model } : {}), warnings: ["chat_content_invalid"] };
  return { status: "content", content: choice.message.content, model: model ?? "unknown-model", warnings: [] };
}

