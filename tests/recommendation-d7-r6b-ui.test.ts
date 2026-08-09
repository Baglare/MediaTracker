import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { aiSessionCodec } from "@/lib/ai/local-state";
import { decodePublicResearchOutcomeNotice } from "@/features/recommendations/research/active/public-codec";
import { ResearchOutcomeNotice } from "@/features/recommendations/ui/research-evidence-disclosure";

const notice = { version: 1 as const, status: "no_verified_match" as const, aspects: [{ aspectId: "romance", label: "untrusted", outcome: "could_not_verify_required" as const }], affectedCandidateCount: 1 };

describe("D7-R6B public outcome notice", () => {
  it("registry label ile strict decode eder; malformed notice güvenli düşer", () => {
    expect(decodePublicResearchOutcomeNotice(notice)).toMatchObject({ status: "no_verified_match", aspects: [{ label: "Romantizm" }] });
    expect(decodePublicResearchOutcomeNotice({ ...notice, affectedCandidateCount: 99 })).toBeNull();
    expect(decodePublicResearchOutcomeNotice({ ...notice, aspects: [{ ...notice.aspects[0], aspectId: "unknown" }] })).toBeNull();
  });

  it("legacy session geçerli kalır; valid notice roundtrip olur ve malformed alan düşer", () => {
    const legacy = aiSessionCodec({ version: 1, sessions: [{ id: "legacy", createdAt: "2026-08-09T00:00:00.000Z", prompt: "p", assistantMessage: "a", recommendations: [] }] });
    expect(legacy.ok).toBe(true);
    const valid = aiSessionCodec({ version: 1, sessions: [{ id: "valid", createdAt: "2026-08-09T00:00:00.000Z", prompt: "p", assistantMessage: "a", recommendations: [], researchOutcomeNotice: notice }] });
    expect(valid.ok && valid.value.sessions[0].researchOutcomeNotice).toMatchObject({ status: "no_verified_match" });
    const malformed = aiSessionCodec({ version: 1, sessions: [{ id: "bad", createdAt: "2026-08-09T00:00:00.000Z", prompt: "p", assistantMessage: "a", recommendations: [], researchOutcomeNotice: { ...notice, aspects: [] } }] });
    expect(malformed.ok && malformed.value.sessions[0]).not.toHaveProperty("researchOutcomeNotice");
  });

  it.each([
    ["no_verified_match", "Kaynak araştırması zorunlu koşulları doğrulayabilen bir eşleşme bulamadı."],
    ["candidates_excluded_by_research", "Bazı adaylar kaçınılan bir unsur kaynaklarla doğrulandığı için elendi."],
    ["research_unavailable", "Kaynak araştırması tamamlanamadı; sonuçlar yapılandırılmış verilere göre gösterildi."],
  ] as const)("%s notice erişilebilir ve responsive render edilir", (status, text) => {
    const decoded = decodePublicResearchOutcomeNotice({ ...notice, status });
    const html = renderToStaticMarkup(createElement(ResearchOutcomeNotice, { notice: decoded ?? undefined }));
    expect(html).toContain('role="status"'); expect(html).toContain('aria-live="polite"'); expect(html).toContain(text);
    expect(html).toContain("min-w-0"); expect(html).toContain("break-words");
    expect(html).not.toMatch(/passage|claim|citation|provider|model|cache|candidate title/i);
  });
});
