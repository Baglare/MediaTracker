import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("local data integrity UI and owner transition contract", () => {
  it("shows counters, rescan, repairability, healthy and recovery-required states", () => {
    const panel = source("components/local-data-integrity-panel.tsx");
    expect(panel).toContain("Veri Bütünlüğü");
    expect(panel).toContain("Yeniden tara");
    expect(panel).toContain("REPAIRABILITY_LABELS");
    expect(panel).toContain("Taranan local veri grafiğinde bütünlük sorunu bulunmadı.");
    expect(panel).toContain('controller.status === "recovery-required"');
  });

  it("states that scanning is read-only and exposes no repair action or sensitive field", () => {
    const panel = source("components/local-data-integrity-panel.tsx");
    expect(panel).toContain("Bu tarama salt okunurdur.");
    expect(panel).toContain("otomatik tamir uygulamaz");
    expect(panel).not.toContain("personalNotes");
    expect(panel).not.toContain("providerPayload");
    expect(panel).not.toContain("ownerScope.userId");
    expect(panel).not.toContain(">Tamir et<");
  });

  it("masks prior-owner results and rejects stale async generations", () => {
    const hook = source("hooks/use-local-data-integrity.ts");
    expect(hook).toContain("setHydratedOwnerKey(null)");
    expect(hook).toContain("setReport(null)");
    expect(hook).toContain("isCurrentOwnerGeneration");
    expect(hook).toContain("isHydratedOwnerVisible");
    expect(hook).toContain("window.clearTimeout(timer)");
  });

  it("uses read-only inspectors and is mounted in Settings data management", () => {
    const hook = source("hooks/use-local-data-integrity.ts");
    const settings = source("features/settings/components/settings-feature.tsx");
    expect(hook).toContain("inspectScopedLocalData");
    expect(hook).toContain("inspectPersonalData");
    expect(hook).toContain("inspectSyncQueue");
    expect(settings).toContain("<LocalDataIntegrityPanel");
  });
});
