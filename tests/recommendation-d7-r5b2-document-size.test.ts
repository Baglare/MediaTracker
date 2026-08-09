import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fetchWikipediaDirectDocument } from "@/features/recommendations/research/adapters/wikipedia/document-adapter";
import { decodeWikidataEntityResponse } from "@/features/recommendations/research/adapters/wikidata/codec";
import type { ResolvedWikipediaPage } from "@/features/recommendations/research/adapters/types";
import { buildGroundedResearchPacket } from "@/features/recommendations/research/passages/packet-builder";
import { normalizeResearchDocument } from "@/features/recommendations/research/passages/normalizer";
import { RESEARCH_PACKET_HARD_MAX_CHARACTERS } from "@/features/recommendations/research/passages/types";
import {
  WIKIPEDIA_EXTRACT_RESPONSE_MAX_BYTES,
  WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES,
  readBoundedResearchBody,
} from "@/features/recommendations/research/network/response-limits";
import {
  GROUNDED_EXTRACTION_WORKING_SET_MAX_CHARACTERS,
  GROUNDED_EXTRACTION_WORKING_SET_MAX_UNITS,
} from "@/features/recommendations/research/extraction/domain/types";
import { FakeSecureResearchHttpClient, fakeHttpJson } from "@/features/recommendations/research/testing/fakes";
import { r3aAcquisitionRequest, r3aDirectDocument } from "@/features/recommendations/research/testing/acquisition-fixtures";

const page: ResolvedWikipediaPage = {
  sourceId: "wikipedia", wikiProject: "enwiki", language: "en", wikidataEntityId: "Q123",
  canonicalTitle: "Bounded fixture", pageId: 42, revisionId: "777", revisionTimestamp: "2026-08-08T00:00:00Z",
  canonicalUrl: "https://en.wikipedia.org/wiki/Bounded_fixture",
  revisionUrl: "https://en.wikipedia.org/w/index.php?title=Bounded_fixture&oldid=777", warnings: [],
};

function extractBody(extract: string) {
  return { query: { pages: [{ pageid: 42, title: "Bounded fixture", fullurl: page.canonicalUrl, pageprops: { wikibase_item: "Q123" }, revisions: [{ revid: 777, timestamp: "2026-08-08T00:00:00Z" }], extract }] } };
}

async function fetchText(text: string) {
  const client = new FakeSecureResearchHttpClient([fakeHttpJson(extractBody(text))]);
  const result = await fetchWikipediaDirectDocument({ page, httpClient: client, userAgent: "MediaTracker/0.1 (contact@example.invalid)", now: () => new Date("2026-08-08T00:00:00Z") });
  return { result, client };
}

describe("D7-R5B.2 bounded Wikipedia full-document policy", () => {
  it.each([23 * 1024, 24 * 1024, 48 * 1024, WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES])("%i UTF-8 byte full extract'i kabul eder", async (bytes) => {
    const text = `Evidence paragraph. ${"x".repeat(bytes - 20)}`;
    expect(Buffer.byteLength(text, "utf8")).toBe(bytes);
    const { result } = await fetchText(text);
    expect(result.document.boundedText).toBe(text);
    expect(result.document.contentHash).toBe(`sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`);
  });

  it("64 KiB + 1 byte extract'i document üretmeden reddeder", async () => {
    await expect(fetchText("x".repeat(WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES + 1))).rejects.toThrow("wikipedia_extract_oversized");
  });

  it("extract JSON envelope için ayrı 96 KiB request cap kullanır", async () => {
    const text = "x".repeat(WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES);
    const encodedEnvelopeBytes = Buffer.byteLength(JSON.stringify(extractBody(text)), "utf8");
    expect(encodedEnvelopeBytes).toBeGreaterThan(WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES);
    expect(encodedEnvelopeBytes).toBeLessThanOrEqual(WIKIPEDIA_EXTRACT_RESPONSE_MAX_BYTES);
    const { client } = await fetchText(text);
    expect(client.requests[0].maxResponseBytes).toBe(WIKIPEDIA_EXTRACT_RESPONSE_MAX_BYTES);
  });

  it("stream limit aşımında partial body döndürmez", async () => {
    const operation = readBoundedResearchBody({ stream: Readable.from([Buffer.alloc(64), Buffer.alloc(65)]), maxBytes: 128 });
    await expect(operation).rejects.toMatchObject({ kind: "oversized_content" });
    await expect(readBoundedResearchBody({ stream: Readable.from([Buffer.alloc(129)]), maxBytes: 128 })).rejects.toThrow("decompressed_body_limit_exceeded");
  });

  it("NFKC sonrası büyüyen document'i yeniden byte-limit kontrolünden geçirir", async () => {
    const expandsUnderNfkc = "㍿".repeat(5_500);
    expect(Buffer.byteLength(expandsUnderNfkc, "utf8")).toBeLessThan(WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES);
    await expect(normalizeResearchDocument({ text: expandsUnderNfkc, title: "Fixture" })).rejects.toThrow("research_document_oversized_after_normalization");
  });

  it("oversized direct document'ten packet/passage üretmez", async () => {
    const oversized = "x".repeat(WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES + 1);
    const direct = r3aDirectDocument({ document: { ...r3aDirectDocument().document, boundedText: oversized } });
    const request = r3aAcquisitionRequest();
    const result = await buildGroundedResearchPacket({
      candidateIdentity: request.candidateIdentity, versionScope: request.versionScope, aspectId: request.aspectId,
      role: request.role, minimumLevel: request.minimumLevel, documents: [{
        documentId: direct.document.documentId, sourceId: "wikipedia", canonicalUrl: direct.document.canonicalUrl,
        language: "en", wikidataEntityId: request.wikimediaIdentity.wikidataEntityId, pageId: 42,
        revisionId: direct.document.revisionId as string, title: direct.document.title, text: direct.document.boundedText,
        citation: direct.citation,
      }], maxPassages: 8, maxPacketCharacters: RESEARCH_PACKET_HARD_MAX_CHARACTERS,
      acquisitionPolicyVersion: request.acquisitionPolicyVersion,
    });
    expect(result).toMatchObject({ status: "security_rejected" });
    expect(result).not.toHaveProperty("packet");
  });

  it("packet ve model working-set bütçelerini büyütmez", () => {
    expect(RESEARCH_PACKET_HARD_MAX_CHARACTERS).toBe(12_000);
    expect(GROUNDED_EXTRACTION_WORKING_SET_MAX_UNITS).toBe(16);
    expect(GROUNDED_EXTRACTION_WORKING_SET_MAX_CHARACTERS).toBe(6_000);
  });

  it("action=parse, HTML/wikitext parser veya eser hardcode'u eklemez", () => {
    const adapter = readFileSync(join(process.cwd(), "features/recommendations/research/adapters/wikipedia/document-adapter.ts"), "utf8");
    expect(adapter).not.toMatch(/action["']?\s*[,=:]\s*["']parse|cheerio|jsdom|readability|wikitext/i);
    expect(adapter).not.toMatch(/Steins;Gate|Fight Club|tt0137523|Q190050/);
  });

  it("exact identity'nin non-primary sitelink metadata'sını acquisition contract'ına göre bound eder", () => {
    const otherSitelinks = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`x${String(index).padStart(2, "0")}wiki`, { title: `Fixture ${index}` }]));
    const body = { entities: { Q123: { id: "Q123", claims: { P345: [{ mainsnak: { datavalue: { value: "tt0000001" } } }] }, sitelinks: { enwiki: { title: "Bounded fixture" }, ...otherSitelinks } } } };
    const decoded = decodeWikidataEntityResponse({ bytes: new TextEncoder().encode(JSON.stringify(body)), entityId: "Q123", propertyId: "P345" });
    expect(decoded.otherSitelinkKeys).toHaveLength(32);
    expect(decoded.otherSitelinkKeys).toEqual([...decoded.otherSitelinkKeys].sort());
    expect(decoded.warnings).toContain("wikidata_other_sitelinks_truncated");
  });
});
