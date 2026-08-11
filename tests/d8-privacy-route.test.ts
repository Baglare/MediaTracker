import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/privacy/page.tsx", "utf8");
const routeShell = readFileSync("components/app-shell/route-app-shell.tsx", "utf8");
const authPanel = readFileSync("components/auth-panel.tsx", "utf8");
const settings = readFileSync("features/settings/components/settings-feature.tsx", "utf8");
const publicTopbar = readFileSync("components/app-shell/public-topbar.tsx", "utf8");

describe("D8 first-release public privacy route", () => {
  it("is unauthenticated, discoverable and uses the shared public shell", () => {
    expect(routeShell).toContain('pathname === "/privacy"');
    for (const source of [authPanel, settings, publicTopbar]) {
      expect(source).toContain('href="/privacy"');
    }
    expect(page).not.toMatch(/useAuth|redirect\(|getSupabase|cookies\(/);
    expect(page).toContain("app-panel");
    expect(page).toContain("var(--app-text-primary)");
  });

  it("covers the factual first-release data, provider, AI, export and deletion boundaries", () => {
    for (const phrase of [
      "yerel-first",
      "Supabase Auth",
      "profil",
      "sosyal",
      "kişisel not",
      "hedef",
      "avatar/banner",
      "Tema",
      "TVMaze",
      "Open Library",
      "Vercel",
      "server-funded AI",
      "dışa aktar",
      "Mock verilere sıfırla",
      "self-service hesap silme",
      "public yeni hesap kaydı kapalıdır",
    ]) expect(page.toLocaleLowerCase("tr-TR"), phrase).toContain(phrase.toLocaleLowerCase("tr-TR"));
  });

  it("publishes only the approved operator/contact and makes no compliance claim", () => {
    expect(page).toContain("Batuhan Parıltı");
    expect(page).toContain("mediatracker.contact@gmail.com");
    const emails = page.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    expect(new Set(emails)).toEqual(new Set(["mediatracker.contact@gmail.com"]));
    expect(page).not.toMatch(/KVKK compliant|GDPR compliant|KVKK uyumlu|GDPR uyumlu/i);
    expect(page).not.toMatch(/postal|telefon|vergi|KEP|şirket adresi/i);
  });
});
