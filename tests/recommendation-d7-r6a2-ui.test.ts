import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { ResearchEvidenceDisclosure, researchAspectSentence } from "@/features/recommendations/ui/research-evidence-disclosure";
import type { PublicResearchEvidenceSummary } from "@/lib/ai/types";

const evidence: PublicResearchEvidenceSummary = { version: 1, status: "research_verified", affectedAspects: [{ aspectId: "romance", label: "Romantizm", finding: "supported", level: "significant", confidence: "medium", sourceCount: 1 }], sources: [{ sourceId: "wikipedia", label: "Wikipedia", url: "https://en.wikipedia.org/w/index.php?title=Example&oldid=12345", attribution: "Wikipedia contributors, CC BY-SA" }] };

describe("D7-R6A2 research transparency UI", () => {
  it("badge, gerçek button, ARIA ve güvenli external link render eder", () => {
    const html = renderToStaticMarkup(createElement(ResearchEvidenceDisclosure, { evidence }));
    expect(html).toContain("Araştırmayla doğrulandı"); expect(html).toContain("Kaynaklı doğrulama");
    expect(html).toContain("aria-expanded=\"false\""); expect(html).toContain("aria-controls=");
    expect(html).toContain("target=\"_blank\""); expect(html).toContain("rel=\"noopener noreferrer\"");
    expect(html).not.toMatch(/passage|quote|snippet|model|provider response/i);
  });

  it("Türkçe finding/level mapping ham enum göstermeden çalışır", () => {
    expect(researchAspectSentence(evidence.affectedAspects[0])).toBe("Romantizm: belirgin düzeyde desteklendi.");
    expect(researchAspectSentence({ ...evidence.affectedAspects[0], finding: "explicit_absence", level: null })).toBe("Kaçınılan unsurun bulunmadığına dair açık kaynak kanıtı bulundu.");
  });

  it("responsive/focus/keyboard contract'ını source düzeyinde korur", () => {
    const source = readFileSync("features/recommendations/ui/research-evidence-disclosure.tsx", "utf8");
    expect(source).toMatch(/<button[\s\S]*aria-expanded[\s\S]*aria-controls[\s\S]*onClick/);
    expect(source).toMatch(/min-w-0/); expect(source).toMatch(/break-words/); expect(source).toMatch(/focus-visible:ring/); expect(source).toMatch(/motion-reduce:transition-none/);
  });
});
