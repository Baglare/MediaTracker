/** Actual byte admission before parsing. Content-Length is only an early hint. */
export class BodyLimitError extends Error {
  constructor() { super("request_too_large"); }
}

export async function readBoundedBytes(
  source: Pick<Request, "body" | "headers">,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("invalid_body_limit");
  const cancel = () => { void source.body?.cancel().catch(() => {}); };
  if (Number(source.headers.get("content-length")) > maxBytes) {
    cancel(); throw new BodyLimitError();
  }
  if (!source.body) return new Uint8Array();
  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let rejectAbort: (reason: Error) => void = () => {};
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => {
    void reader.cancel().catch(() => {});
    rejectAbort(new DOMException("body_aborted", "AbortError"));
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) throw new DOMException("body_aborted", "AbortError");
    while (true) {
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (signal?.aborted) throw new DOMException("body_aborted", "AbortError");
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new BodyLimitError();
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export async function readBoundedText(request: Request, maxBytes: number) {
  return new TextDecoder("utf-8", { fatal: true }).decode(await readBoundedBytes(request, maxBytes, request.signal));
}

export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  return JSON.parse(await readBoundedText(request, maxBytes));
}

export async function readBoundedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const bytes = await readBoundedBytes(request, maxBytes, request.signal);
  return new Response(bytes, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
}
