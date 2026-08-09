import { researchDocumentTextWithinLimit } from "../security/content-policy";
import { researchSha256 } from "./hash";
import { documentSecurityRejected, inspectResearchPassageSecurity } from "./security-policy";
import type { ResearchPassageSecurityFlag } from "./types";

export interface NormalizedResearchDocument {
  text: string;
  contentHash: string;
  securityFlags: readonly ResearchPassageSecurityFlag[];
}

function collapseBlankLines(lines: readonly string[]): string[] {
  const output: string[] = [];
  let blank = false;
  for (const line of lines) {
    if (!line) {
      if (!blank && output.length > 0) output.push("");
      blank = true;
    } else {
      output.push(line);
      blank = false;
    }
  }
  while (output.at(-1) === "") output.pop();
  return output;
}

export async function normalizeResearchDocument(input: { text: string; title: string }): Promise<NormalizedResearchDocument> {
  const rawFlags = inspectResearchPassageSecurity(input.text);
  if (documentSecurityRejected(rawFlags)) throw new Error(`research_document_security_rejected:${rawFlags.join(",")}`);
  let lines = input.text
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, "").trimStart());
  const normalizedTitle = input.title.normalize("NFKC").trim().toLocaleLowerCase("en");
  if (lines.length > 1 && lines[0].trim().toLocaleLowerCase("en") === normalizedTitle && lines[1].trim().toLocaleLowerCase("en") === normalizedTitle) {
    lines = lines.slice(1);
  }
  const text = collapseBlankLines(lines).join("\n").trim();
  if (!text) throw new Error("research_document_empty_after_normalization");
  if (!researchDocumentTextWithinLimit(text)) throw new Error("research_document_oversized_after_normalization");
  const securityFlags = inspectResearchPassageSecurity(text);
  if (documentSecurityRejected(securityFlags)) throw new Error(`research_document_security_rejected:${securityFlags.join(",")}`);
  return { text, contentHash: await researchSha256(text), securityFlags };
}
