export interface RecommendationChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/** Stable event-id dedupe; identical text with a different id remains a valid new message. */
export function appendRecommendationMessage<T extends RecommendationChatMessage>(
  messages: readonly T[],
  message: T,
): T[] {
  return messages.some((item) => item.id === message.id) ? [...messages] : [...messages, message];
}
