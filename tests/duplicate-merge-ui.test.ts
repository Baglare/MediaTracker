import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("duplicate merge UI contracts", () => {
  it("requires subset, survivor, identity, field and explicit confirmation steps", () => {
    const workflow = readFileSync("components/duplicate-merge-workflow.tsx", "utf8");
    expect(workflow).toContain("Birleştirilecek alt kümeyi seç");
    expect(workflow).toContain("Survivor local kayıt");
    expect(workflow).toContain("Canonical identity");
    expect(workflow).toContain("Alan çakışmalarını çöz");
    expect(workflow).toContain("Planı yeniden doğrula");
    expect(workflow).toContain("Merge’i uygula");
    expect(workflow).toContain("Bu kayıtların aynı medyayı temsil ettiğini doğruluyorum.");
    expect(workflow).not.toMatch(/useState\(\s*candidate\.recordIds/);
  });

  it("shows XP/cloud safety and only reveals notes after an explicit action", () => {
    const workflow = readFileSync("components/duplicate-merge-workflow.tsx", "utf8");
    expect(workflow).toContain("XP korunacak; bu işlem XP toplamını değiştirmez.");
    expect(workflow).toContain("durable queue");
    expect(workflow).toContain("İçeriği açıkça göster");
    expect(workflow).toMatch(/conflict\.sensitive && !revealed/);
    expect(workflow).not.toMatch(/grantXp|revokeXp|queueMediaSocialEvents/);
  });

  it("surfaces pending sync, recovery and bounded last-merge undo", () => {
    const panel = readFileSync("components/duplicate-review-panel.tsx", "utf8");
    expect(panel).toContain("Cloud sync bekliyor");
    expect(panel).toContain("Son merge’i geri al");
    expect(panel).toContain("recovery gerekiyor");
    expect(panel).toContain("Cross-device undo revision/tombstone olmadan garanti edilmez");
    expect(panel).toContain("Kayıtlar otomatik olarak değiştirilmez");
  });
});
