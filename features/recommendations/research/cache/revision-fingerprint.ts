import "server-only";

import { createHash } from "node:crypto";
import type { PersistedResearchCitation } from "../domain/types";

export function buildSourceRevisionFingerprint(citations: readonly PersistedResearchCitation[]): string {
  const revisionMaterial = citations
    .map((citation) => `${citation.sourceId}:${citation.revisionId ?? "none"}:${citation.sourceContentHash}`)
    .sort()
    .join("|");
  return `sha256:${createHash("sha256").update(revisionMaterial, "utf8").digest("hex")}`;
}
