/** Keep provider failures distinct from a successful empty search. */
export class SearchResponseError extends Error {}

export async function readSearchResponse<T>(response: Response): Promise<{ results: T[] }> {
  if (!response.ok) {
    const retry = Number(response.headers.get("retry-after"));
    const wait = Number.isInteger(retry) && retry > 0 && retry <= 86400
      ? `${retry} saniye sonra tekrar deneyin.` : "Bir süre sonra tekrar deneyin.";
    const message = response.status === 429 ? "Arama kapasitesi dolu."
      : response.status === 503 ? "Arama hizmeti geçici olarak kullanılamıyor."
      : response.status === 502 ? "Arama kaynağına ulaşılamadı."
      : "Arama tamamlanamadı.";
    throw new SearchResponseError(`${message} ${wait}`);
  }
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || !("results" in data) || !Array.isArray(data.results)) {
    throw new SearchResponseError("Arama yanıtı okunamadı. Tekrar deneyin.");
  }
  return { results: data.results as T[] };
}
