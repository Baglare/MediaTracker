import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("duplicate merge UI contracts", () => {
  it("requires subset, survivor, identity, field and explicit confirmation steps", () => {
    const workflow = readFileSync("components/duplicate-merge-workflow.tsx", "utf8");
    expect(workflow).toContain("Birleştirilecek alt kümeyi seç");
    expect(workflow).toContain("Korunacak yerel kayıt");
    expect(workflow).toContain("Ana kimlik");
    expect(workflow).toContain("Alan çakışmalarını çöz");
    expect(workflow).toContain("Planı yeniden doğrula");
    expect(workflow).toContain("Birleştirmeyi uygula");
    expect(workflow).toContain("Bu kayıtların aynı medyayı temsil ettiğini doğruluyorum.");
    expect(workflow).not.toMatch(/useState\(\s*candidate\.recordIds/);
  });

  it("shows XP/cloud safety and only reveals notes after an explicit action", () => {
    const workflow = readFileSync("components/duplicate-merge-workflow.tsx", "utf8");
    expect(workflow).toContain("XP korunacak; bu işlem XP toplamını değiştirmez.");
    expect(workflow).toContain("kalıcı kuyruğa");
    expect(workflow).toContain("İçeriği açıkça göster");
    expect(workflow).toMatch(/conflict\.sensitive && !revealed/);
    expect(workflow).not.toMatch(/grantXp|revokeXp|queueMediaSocialEvents/);
  });

  it("surfaces pending sync, recovery and bounded last-merge undo", () => {
    const panel = readFileSync("components/duplicate-review-panel.tsx", "utf8");
    expect(panel).toContain("Cloud eşitleme bekliyor");
    expect(panel).toContain("Son birleştirmeyi geri al");
    expect(panel).toContain("kurtarma gerekiyor");
    expect(panel).toContain("Cihazlar arası geri alma, sürüm ve silinme kaydı olmadan garanti edilmez");
    expect(panel).toContain("Kayıtlar otomatik olarak değiştirilmez");
  });
});
