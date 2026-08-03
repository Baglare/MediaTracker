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
    expect(panel).toContain("Yedek önizlemesi oluştur");
    expect(panel).toContain("Sağlama toplamı ile doğrulanmış dışa aktarım hazır");
    expect(panel).toContain("JSON dosyasını indir");
    expect(panel).toContain("portableBackupFilename");
  });

  it("requires explicit personal-note selection and shows only safe counts", () => {
    const panel = source("components/portable-backup-panel.tsx");

    expect(panel).toContain("Kişisel not içeriklerini yedeğe");
    expect(panel).toContain("checked={includePersonalNotes}");
    expect(panel).toContain("manifest.counts");
    expect(panel).not.toContain("item.personalNotes}");
    expect(panel).not.toContain("providerPayload");
    expect(panel).not.toContain("ownerScope.userId");
  });

  it("keeps file inspection read-only and separate from legacy import writes", () => {
    const panel = source("components/portable-backup-panel.tsx");

    expect(panel).toContain("Yedek dosyasını salt okunur incele");
    expect(panel).toContain("Dosya inceleme verilerinizi değiştirmez");
    expect(panel).toContain("inspectPortableBackupText");
    expect(panel).not.toContain("onImport");
    expect(panel).not.toContain("localStorage.setItem");
  });

  it("requires an owner-scoped dry-run and explicit additive import confirmation", () => {
    const panel = source("components/portable-backup-panel.tsx");
    const dataManagement = source("components/data-management-panel.tsx");

    expect(dataManagement).toContain('key={ownerScope?.key ?? "owner-pending"}');
    expect(panel).toContain("preparePortableAdditiveImport");
    expect(panel).toContain("executePortableAdditiveImport");
    expect(panel).toContain("Eklemeli içe aktarmayı uygula");
    expect(panel).toContain("Açık seçim: ayrı yerel kayıt olarak ekle");
    expect(panel).toContain("Son içe aktarmayı geri al");
    expect(panel).toContain("inspectPortableImportUndo");
    expect(panel).toContain("disabled={importBusy || !undoAvailability.available}");
    expect(panel).toContain("Cloud eşitleme başladıktan");
    expect(panel).toContain("SHA-256 yalnız dosya bütünlüğünü doğrular");
    expect(panel).not.toContain("personalNotes}");
    expect(panel).not.toContain("deleteMediaItem");
  });
});
