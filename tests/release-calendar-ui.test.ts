import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "features/calendar/components/calendar-feature.tsx"),
  "utf8",
);
const hookSource = fs.readFileSync(
  path.join(process.cwd(), "features/calendar/hooks/use-release-calendar.ts"),
  "utf8",
);

describe("release agenda UI contract", () => {
  it("replaces only the provider placeholder with agenda states", () => {
    expect(source).not.toContain("Gerçek yayın verisi bekleniyor");
    expect(source).toContain("Yaklaşan yayınlar");
    expect(source).toContain("Yayınları yenile");
    expect(source).toContain("Yayın takvimi yükleniyor");
    expect(source).toContain("Eski cache");
    expect(source).toContain("Bazı yayın kaynakları yenilenemedi");
  });

  it("preserves the existing activity, planning and active sections", () => {
    expect(source).toContain("Bugünkü / son aktiviteler");
    expect(source).toContain("Planlanan içerikler");
    expect(source).toContain("Devam eden içerikler");
    expect(source).toContain("commands.openDetail");
  });

  it("does not add monthly view or manual event CRUD", () => {
    expect(source).not.toContain("Aylık görünüm");
    expect(source).not.toContain("Manuel olay ekle");
  });

  it("masks previous-owner state and rejects stale async generations", () => {
    expect(hookSource).toContain("state?.ownerScope === input.ownerScope?.key");
    expect(hookSource).toContain("generation !== generationRef.current");
    expect(hookSource).toContain("scopeRef.current?.key !== scope.key");
  });
});
