import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Portable Backup V2 UI contract", () => {
  it("mounts export preview and download inside Data Management", () => {
    const panel = source("components/portable-backup-panel.tsx");
    const dataManagement = source("components/data-management-panel.tsx");

    expect(dataManagement).toContain("<PortableBackupPanel");
    expect(panel).toContain("Backup önizlemesi oluştur");
    expect(panel).toContain("Checksum ile doğrulanmış export hazır");
    expect(panel).toContain("JSON dosyasını indir");
    expect(panel).toContain("portableBackupFilename");
  });

  it("requires explicit personal-note selection and shows only safe counts", () => {
    const panel = source("components/portable-backup-panel.tsx");

    expect(panel).toContain("Personal note içeriklerini backup");
    expect(panel).toContain("checked={includePersonalNotes}");
    expect(panel).toContain("manifest.counts");
    expect(panel).not.toContain("item.personalNotes}");
    expect(panel).not.toContain("providerPayload");
    expect(panel).not.toContain("ownerScope.userId");
  });

  it("keeps file inspection read-only and separate from legacy import writes", () => {
    const panel = source("components/portable-backup-panel.tsx");

    expect(panel).toContain("Backup dosyasını read-only incele");
    expect(panel).toContain("Dosya inceleme verilerinizi değiştirmez");
    expect(panel).toContain("inspectPortableBackupText");
    expect(panel).not.toContain("onImport");
    expect(panel).not.toContain("localStorage.setItem");
  });
});
