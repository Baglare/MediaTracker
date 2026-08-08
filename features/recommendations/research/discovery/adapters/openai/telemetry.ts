export function boundedOpenAiRequestId(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(trimmed) ? trimmed : undefined;
}

export function openAiStatusClass(status: number): string {
  return Number.isInteger(status) && status >= 100 && status <= 599 ? `${Math.floor(status / 100)}xx` : "unknown";
}
