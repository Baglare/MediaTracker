import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import PrivacyPage, { metadata } from "@/app/privacy/page";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children),
}));

const source = readFileSync("app/privacy/page.tsx", "utf8");
const procedure = readFileSync("docs/V1_HARDENING_05B_PRIVACY_NOTICE_AND_REQUESTS.md", "utf8");
const shell = readFileSync("components/app-shell/route-app-shell.tsx", "utf8");
const markup = () => {
  vi.stubGlobal("React", React);
  return renderToStaticMarkup(React.createElement(PrivacyPage));
};
afterEach(() => vi.unstubAllGlobals());

describe("05B public factual notice and manual request procedure", () => {
  it("renders without an account, request context or network and retains public navigation", () => {
    const html = markup();
    expect(metadata.title).toBe("Kişisel Veriler ve Gizlilik | MediaTracker");
    expect(html).toContain("Batuhan Parıltı");
    expect(html).toContain('href="mailto:mediatracker.contact@gmail.com"');
    expect(html).toContain('href="/"');
    expect(shell).toContain('pathname === "/privacy"');
    expect(source).not.toMatch(/use client|useAuth|redirect\(|cookies\(|fetch\(|localStorage|<Script/);
    for (const path of ["components/auth-panel.tsx", "features/settings/components/settings-feature.tsx", "components/app-shell/public-topbar.tsx"]) {
      expect(readFileSync(path, "utf8"), path).toContain('href="/privacy"');
    }
  });

  it("renders both notice sections and all ten understandable processing groups", () => {
    const html = markup();
    expect(html).toContain("A. KVKK Aydınlatma Metni");
    expect(html).toContain("B. Ek gizlilik ve veri kontrolü bilgileri");
    for (const title of ["Hesap ve kimlik doğrulama", "Yerel kütüphane, ilerleme, notlar ve hedefler", "İsteğe bağlı Cloud eşitlemesi", "Profil ve profil dosyaları", "Sosyal özellikler", "Tercihler ve temalar", "Öneriler ve yerel AI durumu", "Sağlayıcı aramaları", "Güvenlik ve kötüye kullanımın önlenmesi", "Destek ve gizlilik başvuruları"]) {
      expect(html).toContain(`<h3 class="font-semibold text-[var(--app-text-primary)]">${title}</h3>`);
    }
    for (const field of ["Veriler", "Amaç", "Toplama yöntemi", "İşleme yeri ve alıcılar"]) {
      expect(html.match(new RegExp(`<dt class="font-medium">${field}</dt>`, "g"))).toHaveLength(10);
    }
    expect(html).toContain("tamamen veya kısmen otomatik");
    expect(html).toContain("merkezi sunucuya kendiliğinden iletilmez");
  });

  it("publishes all nine Article 11 rights with conditional erasure and recipient notification", () => {
    const rights = markup().split("İlgili kişinin hakları</h2>")[1].split("</section>")[0];
    expect(rights.match(/<li>/g)).toHaveLength(9);
    for (const phrase of ["işlenip işlenmediğini", "bilgi istemek", "amaca uygun", "yurt dışında", "düzeltilmesini", "7. maddesindeki koşullar", "üçüncü kişilere bildirilmesini", "otomatik analiz", "zararın giderilmesini", "saklama yükümlülükleri"]) {
      expect(rights).toContain(phrase);
    }
  });

  it("separates registered-email formal applications from unmatched intake and protects secrets", () => {
    const html = markup();
    for (const phrase of ["hesabınıza kayıtlı e-posta adresinden", "daha önce bildirilmiş", "sisteminde kayıtlı", "Eşleştirilemeyen e-postalar", "Kimlik doğrulanmadan", "kapsamı kısmidir", "en geç 30 gün", "yazılı veya elektronik yanıt", "gerekçeli", "yeniden başlatmaz", "asgari ve ölçülü", "göndermeyin", "oturum token", "çerezini", "API anahtarını", "gereksiz tam kimlik"]) expect(html).toContain(phrase);
    expect(html).toContain("Kişisel Verileri Koruma Kuruluna şikâyet");
    expect(html).not.toMatch(/<form|<input|<textarea|KEP|\d{10,11}/);
    expect(html).not.toMatch(/href="tel:|şirket adresi|vergi numarası/);
  });

  it("does not conflate notice with consent or invent a complete export, erase or retention capability", () => {
    const html = markup();
    for (const phrase of ["açık rıza metni değildir", "kabul etme koşuluna bağlı değildir", "genel bir yedek dayanak", "self-service dışa aktarma kısmidir", "tam hesap dışa aktarımı değildir", "teknik kapsamı ayrıca", "self-service hesap silme ekranı yoktur", "Çıkış yapmak veri silmek değildir", "tam silme değildir", "kurtarma/yedek", "fiziksel temizleme", "posta kutusu", "ayrı saklama politikası"]) expect(html).toContain(phrase);
    expect(html).not.toMatch(/checkbox|type="submit"|KVKK metnini onaylıyorum|bir tıkla.*sil|tüm verileri.*siler/i);
    expect(html).not.toMatch(/KVKK uyumlu|KVKK compliant|legally approved|VERBİS.*muaf|aktarımı hukuka uygundur|madde 9.*çözülmüştür/i);
  });

  it("keeps provider, AI, foreign processing and provisional basis statements accurately scoped", () => {
    const html = markup();
    for (const phrase of ["AniList ve TMDB canlı API erişimi v1 kodunda kapalıdır", "OMDb public API erişimi kapalıdır", "Open Library yalnız geçerli", "manuel kayıt kapısı", "TVMaze", "hukuki/lisans", "kapak URL", "tarayıcıdan doğrudan", "Türkiye dışında", "IP ve istek metadata", "madde 9 mekanizması", "henüz kesinleştirilmemiştir", "meşru menfaat", "kesinleşmiş hukuki dayanak", "yayın kabul", "V1 politika hedefinde server-funded AI", "Canlı ortam değerleri", "Deterministik öneri", "özel nitelikli", "Olağan medya tercihleri"]) expect(html).toContain(phrase);
    expect(html).not.toContain("public yeni hesap kaydı kapalıdır");
    expect(html).not.toContain("kullanıcı verisi ücretli bir AI sağlayıcısına gönderilmez");
  });

  it("documents separate legal gates, the manual clock and future technical handoffs", () => {
    for (const status of ["LEGAL_BASIS_MATRIX = PROVISIONAL_PENDING_LEGAL_REVIEW", "DATA_SUBJECT_REQUEST_PROCESS = MANUAL_WITH_TECHNICAL_PROCEDURE", "DATA_SUBJECT_REQUEST_PROCEDURE = DOCUMENTED_MANUAL", "FORMAL_APPLICATION_CHANNEL_COVERAGE = PARTIAL", "ARTICLE_9_MECHANISM = MANUAL_LEGAL_GATE", "VERBIS_STATUS = MANUAL_OPERATOR_CONFIRMATION", "MANUAL_LEGAL_REVIEW_REQUIRED"]) expect(procedure).toContain(status);
    for (const phrase of ["05C", "05D", "30", "received_timestamp", "due_date", "identity_verification_state", "request_reference_id", "completed_timestamp", "XP", "RESTRICT", "vendor", "Export-before-delete"]) expect(procedure).toContain(phrase);
  });
});
