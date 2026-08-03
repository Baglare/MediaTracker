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
const panelSource = fs.readFileSync(
  path.join(process.cwd(), "features/calendar/components/release-calendar-panel.tsx"),
  "utf8",
);
const dialogSource = fs.readFileSync(
  path.join(process.cwd(), "features/calendar/components/manual-release-event-dialog.tsx"),
  "utf8",
);
const commandsSource = fs.readFileSync(
  path.join(process.cwd(), "features/library/hooks/use-media-commands.ts"),
  "utf8",
);

describe("release agenda UI contract", () => {
  it("replaces only the provider placeholder with agenda states", () => {
    expect(source).not.toContain("Gerçek yayın verisi bekleniyor");
    expect(source).toContain("Yaklaşan yayınlar");
    expect(panelSource).toContain("Yayınları yenile");
    expect(panelSource).toContain("Yayın takvimi yükleniyor");
    expect(panelSource).toContain("Eski cache");
    expect(panelSource).toContain("Bazı yayın kaynakları yenilenemedi");
  });

  it("preserves the existing activity, planning and active sections", () => {
    expect(source).toContain("Bugünkü / son aktiviteler");
    expect(source).toContain("Planlanan içerikler");
    expect(source).toContain("Devam eden içerikler");
    expect(source).toContain("commands.openDetail");
  });

  it("adds the monthly view without manual event CRUD", () => {
    expect(panelSource).toContain("Ajanda görünümünü göster");
    expect(panelSource).toContain("Aylık görünümü göster");
    expect(panelSource).toContain("grid-cols-7");
    expect(panelSource).toContain("Önceki aya git");
    expect(panelSource).toContain("Sonraki aya git");
    expect(panelSource).toContain("Tarihi açıklanmadı");
    expect(panelSource).not.toContain("Manuel olay ekle");
  });

  it("keeps month navigation local and exposes accessible selection state", () => {
    const navigateMonth = panelSource.slice(
      panelSource.indexOf("const navigateMonth"),
      panelSource.indexOf("const selectDay"),
    );
    expect(navigateMonth).not.toContain("refresh");
    expect(panelSource).toContain("aria-pressed={view === option}");
    expect(panelSource).toContain("aria-selected={day.isSelected}");
    expect(panelSource).toContain('aria-current={day.isToday ? "date" : undefined}');
    expect(panelSource).toContain("focus-visible:ring-2");
    expect(panelSource).toContain("motion-reduce:animate-none");
  });

  it("masks previous-owner state and rejects stale async generations", () => {
    expect(hookSource).toContain("state?.ownerScope === input.ownerScope?.key");
    expect(hookSource).toContain("generation !== generationRef.current");
    expect(hookSource).toContain("scopeRef.current?.key !== scope.key");
  });

  it("offers validated manual CRUD and stable provider-event visibility controls", () => {
    expect(panelSource).toContain("Manuel yayın ekle");
    expect(panelSource).toContain("Gizlenen yayınları yönet");
    expect(panelSource).toContain("Geri getir");
    expect(panelSource).toContain("hideProviderReleaseEvent");
    expect(panelSource).toContain("deleteManualReleaseEvent");
    expect(dialogSource).toContain("Tarih kesinliği");
    expect(dialogSource).toContain("createManualReleaseEvent");
    expect(dialogSource).toContain("updateManualReleaseEvent");
    expect(dialogSource).toContain('event.key === "Escape"');
    expect(dialogSource).toContain('event.key !== "Tab"');
    expect(dialogSource).toContain("previouslyFocused?.focus()");
    expect(dialogSource).toContain("aria-describedby");
    expect(dialogSource).toContain("aria-invalid");
    expect(panelSource).toContain('media.coverImage || `/placeholders/${media.type}.svg`');
  });

  it("persists calendar changes through the existing media mutation path", () => {
    expect(source).toContain("onSave={commands.mutations.save}");
    expect(source).toContain('key={ownerScope?.key ?? "owner-pending"}');
    expect(commandsSource).toContain("save: mutations.saveMedia");
    expect(panelSource).not.toContain("enqueueMediaUpsert");
    expect(panelSource).not.toContain("localStorage");
  });
});
