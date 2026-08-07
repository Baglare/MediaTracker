import "server-only";

import type { Readable } from "node:stream";
import { createGunzip, createInflate } from "node:zlib";
import { SecureResearchHttpError } from "./types";

export const WIKIDATA_JSON_MAX_BYTES = 256 * 1024;
export const WIKIPEDIA_API_JSON_MAX_BYTES = 256 * 1024;
export const WIKIPEDIA_PLAINTEXT_MAX_BYTES = 24_000;

export async function readBoundedResearchBody(input: {
  stream: Readable;
  contentEncoding?: string;
  maxBytes: number;
}): Promise<{ body: Uint8Array; bytesRead: number }> {
  const encoding = input.contentEncoding?.trim().toLowerCase() || "identity";
  let decoded: Readable = input.stream;
  if (encoding === "gzip") decoded = input.stream.pipe(createGunzip());
  else if (encoding === "deflate") decoded = input.stream.pipe(createInflate());
  else if (encoding !== "identity") throw new SecureResearchHttpError("invalid_encoding", "content_encoding_not_allowed");

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytesRead = 0;
    const fail = (error: unknown) => {
      input.stream.destroy();
      decoded.destroy();
      reject(error instanceof SecureResearchHttpError ? error : new SecureResearchHttpError("invalid_encoding", "response_stream_invalid"));
    };
    decoded.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += buffer.byteLength;
      if (bytesRead > input.maxBytes) {
        fail(new SecureResearchHttpError("oversized_content", "decompressed_body_limit_exceeded"));
        return;
      }
      chunks.push(buffer);
    });
    decoded.once("error", fail);
    decoded.once("end", () => resolve({ body: Buffer.concat(chunks), bytesRead }));
  });
}

export function decodeStrictUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new SecureResearchHttpError("invalid_encoding", "invalid_utf8");
  }
}

export function assertResearchContentType(value: string | undefined, accepted: readonly string[]): string {
  const normalized = (value ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!normalized || !accepted.map((item) => item.toLowerCase()).includes(normalized)) {
    throw new SecureResearchHttpError("content_type_rejected", "content_type_not_allowed");
  }
  return normalized;
}
