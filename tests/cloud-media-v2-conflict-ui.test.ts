import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync(
  "components/cloud-sync-status-card.tsx",
  "utf8",
);
const panel = readFileSync(
  "components/cloud-v2-conflict-panel.tsx",
  "utf8",
);

describe("Cloud Media V2 conflict UI contract", () => {
  it("shows adapter and owner-scoped sync counters", () => {
    expect(card).toContain("Aktif Adapter");
    expect(card).toContain("Legacy");
    expect(card).toContain("Cloud V2");
    expect(card).toContain("in-flight");
    expect(card).toContain("retryable");
    expect(card).toContain("blocked");
    expect(card).toContain("Son Sync");
  });

  it("exposes explicit conflict actions without a V2 enable toggle", () => {
    expect(panel).toContain("Buluttaki sürümü kullan");
    expect(panel).toContain("Yerel değişikliği retry et");
    expect(panel).toContain("Silinmiş olarak bırak");
    expect(panel).toContain("Açık onayla restore et");
    expect(panel).toContain("Parent media sonrası retry");
    expect(panel).toContain("Şimdilik ertele");
    expect(panel).not.toContain("V2'yi aç");
    expect(panel).not.toContain("Cloud V2'yi etkinleştir");
  });

  it("does not render sensitive payload fields", () => {
    expect(panel).not.toContain("personalNotes");
    expect(panel).not.toContain("rawProviderPayload");
    expect(panel).not.toContain("operationId");
  });
});
