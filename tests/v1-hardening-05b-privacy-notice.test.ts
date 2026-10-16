import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.each(["supabase", "native"] as const)("05B public factual notice and manual request procedure (%s)", (provider) => {
  beforeEach(() => {
    vi.stubEnv("BACKEND_PROVIDER", provider);
    vi.stubEnv("NEXT_PUBLIC_BACKEND_PROVIDER", provider);
  });

  it("renders the selected architecture without substituting another backend or implying live acceptance", () => {
    const html = markup();
    const groups = html.split("İşlenen veriler, amaçlar ve toplama yöntemi</h2>")[1].split("</section>")[0];
    const recipients = html.split("Alıcılar, dış servisler ve yurt dışı işleme</h2>")[1].split("</section>")[0];
    if (provider === "native") {
      for (const phrase of ["Better Auth", "şifre özeti ve oturum kayıtları", "özel PostgreSQL şemasında", "oturum çerezleri", "native PostgreSQL", "TürkHosting/Plesk/Passenger", "özel dosya sistemi", "erişim uygulama üzerinden denetlenir"]) expect(groups).toContain(phrase);
      expect(groups).not.toMatch(/Supabase|Vercel/);
      expect(groups).toContain("Hesap oluşturmak, e-posta doğrulamasını, parola sıfırlamayı");
      expect(html).toContain("girişten önce e-posta doğrulaması zorunludur");
      expect(html).toContain("Kayıt ayarının açılması hukuki değerlendirmelerin tamamlandığı anlamına gelmez");
      expect(html).not.toContain("yeni kayıt varsayılan olarak kapalıdır");
      // All eight server-processing groups must identify their selected destination.
      expect(groups.match(/<dd>[^<]*native PostgreSQL/g)).toHaveLength(6);
      expect(groups.match(/<dd>[^<]*uygulama sunucusu/gi)).toHaveLength(8);
      expect(recipients).toContain("erişim denetimli dosya uçları");
      expect(recipients).toContain("özel depolama doğrudan herkese açık değildir");
      expect(recipients).not.toMatch(/Supabase|Vercel/);
      for (const phrase of ["Supabase alternatifi korunmaktadır", "gerçek veritabanı kabulünün", "Altyapının işletilmesi yeni sürümün bütün kullanıcı", "akışlarının kabul edildiği anlamına gelmez", "Operatörün bildirdiği TürkHosting yazılı yanıtına göre", "bağımsız olarak doğrulanmış sözleşme kanıtı değildir", "yabancı alt işleyen kullanılmaz", "Türkiye merkezlidir", "yaklaşık dört haftalık", "hosting rotasyonu bu kopyaları temizlemez", "loglarının saklama süresi de kesinleşmemiştir"]) expect(html).toContain(phrase);
      expect(recipients).toContain("Yanıt Gmail, TVMaze, dış görsel/CDN, tarayıcı veya operatörün bağımsız yedek kopyalarını kapsamaz");
      expect(html).toContain("belirli bir hesabın son kopyasının");
      expect(html).toContain("kesin silinme tarihi veya özel dosyaların tutarlı yedeklendiği/geri yüklenebildiği kanıtı değildir");
      expect(html).toContain("IP, zaman, istek ve User-Agent");
      expect(html).toContain("Kayıtta yazılmış adres veya o adresten gelen mesaj tek başına hesap sahipliğini kanıtlamaz");
      expect(html).not.toContain("native production geçişi henüz tamamlanmamıştır");
    } else {
      for (const phrase of ["Supabase Auth", "şifre işlenir, uygulama tablosunda tutulmaz", "Supabase Postgres/Storage", "Supabase sınırlandırma/sosyal kayıtları", "Vercel"]) expect(groups).toContain(phrase);
      expect(recipients).toContain("Supabase imzalı profil dosyaları");
      expect(recipients).toContain("Vercel, Supabase, posta ve diğer dış servisler");
      expect(html).not.toMatch(/Better Auth|native PostgreSQL|TürkHosting|Plesk|Passenger|özel dosya sistemi/);
    }
    for (const phrase of ["TVMaze", "Open Library", "Gmail", "Sağlayıcı/CDN görselleri", "tarayıcıdan doğrudan", "IP ve istek metadata"]) expect(html).toContain(phrase);
    expect(html).not.toMatch(/tüm veriler Türkiye|loglar \d+ gün|yedekler \d+ gün|KVKK uyumlu/i);
  });

  it("uses the existing selector's fail-closed configuration checks", () => {
    vi.stubEnv("NEXT_PUBLIC_BACKEND_PROVIDER", provider === "native" ? "supabase" : "native");
    expect(markup).toThrow("backend_configuration_invalid");
    vi.stubEnv("BACKEND_PROVIDER", "unknown");
    expect(markup).toThrow("backend_configuration_invalid");
  });
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

  it("keeps registration disclosure before submission without a mandatory consent control", () => {
    const panel = readFileSync("components/auth-panel.tsx", "utf8");
    const disclosure = panel.indexOf("{registering && <p");
    expect(disclosure).toBeGreaterThan(-1);
    expect(disclosure).toBeLessThan(panel.indexOf('type="submit"'));
    expect(panel.slice(disclosure, panel.indexOf('type="submit"'))).toContain('href="/privacy"');
    expect(panel).toContain("Bu bilgilendirme açık rıza talebi değildir");
    expect(panel).toContain("Girişten önce e-posta doğrulaması gerekir");
    expect(panel).not.toMatch(/type="checkbox"|privacyConsent|consentRequired/);
    const shell = readFileSync("components/app-shell/app-shell.tsx", "utf8");
    expect(shell).toContain('href="/privacy"');
    expect(shell.match(/<PrivacyFooter \/>/g)).toHaveLength(2);
  });

  it("renders both notice sections and all ten understandable processing groups", () => {
    const html = markup();
    expect(html).toContain("A. KVKK Aydınlatma Metni");
    expect(html).toContain("B. Ek gizlilik ve veri kontrolü bilgileri");
    for (const title of ["Hesap ve kimlik doğrulama", "Yerel kütüphane, ilerleme, notlar ve hedefler", "İsteğe bağlı Cloud eşitlemesi", "Profil ve profil dosyaları", "Sosyal özellikler", "Tercihler ve temalar", "Öneriler ve yerel AI durumu", "Sağlayıcı aramaları", "Güvenlik ve kötüye kullanımın önlenmesi", "Destek ve gizlilik başvuruları"]) {
      expect(html).toContain(`<h3 class="font-semibold text-[var(--app-text-primary)]">${title}</h3>`);
    }
    for (const field of ["Veriler", "Amaç", "Hukuki dayanak ve sınırı", "Toplama yöntemi", "İşleme yeri ve alıcılar"]) {
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

  it("keeps provider, AI, foreign processing and purpose-limited basis statements accurately scoped", () => {
    const html = markup();
    for (const phrase of ["AniList ve TMDB canlı API erişimi v1 kodunda kapalıdır", "OMDb public API erişimi kapalıdır", "Open Library yalnız geçerli", "manuel kayıt kapısı", "TVMaze", "hukuki/lisans", "kapak URL", "tarayıcıdan doğrudan", "Türkiye dışında", "IP ve istek metadata", "madde 9 mekanizması", "henüz kesinleştirilmemiştir", "meşru menfaat", "Her dayanak yalnız gerekli işlem kapsamıyla sınırlıdır", "yayın kabul", "V1 politika hedefinde server-funded AI", "Canlı ortam değerleri", "Deterministik öneri", "özel nitelikli", "Olağan medya tercihleri"]) expect(html).toContain(phrase);
    for (const phrase of ["90 gün", "12 ay", "kanunun zorunlu kıldığı süreler değildir", "uygulama otomatik silmez", "Somut uyuşmazlık", "gözden geçirme tarihi"]) expect(html).toContain(phrase);
    expect(html).not.toContain("public yeni hesap kaydı kapalıdır");
    expect(html).not.toContain("kullanıcı verisi ücretli bir AI sağlayıcısına gönderilmez");
  });

  it("documents separate legal gates, the manual clock and future technical handoffs", () => {
    for (const status of ["LEGAL_BASIS_MATRIX = PROVISIONAL_PENDING_LEGAL_REVIEW", "DATA_SUBJECT_REQUEST_PROCESS = MANUAL_WITH_TECHNICAL_PROCEDURE", "DATA_SUBJECT_REQUEST_PROCEDURE = DOCUMENTED_MANUAL", "FORMAL_APPLICATION_CHANNEL_COVERAGE = PARTIAL", "ARTICLE_9_MECHANISM = MANUAL_LEGAL_GATE", "VERBIS_STATUS = MANUAL_OPERATOR_CONFIRMATION", "MANUAL_LEGAL_REVIEW_REQUIRED"]) expect(procedure).toContain(status);
    for (const phrase of ["05C", "05D", "30", "received_timestamp", "due_date", "identity_verification_state", "request_reference_id", "completed_timestamp", "XP", "RESTRICT", "vendor", "Export-before-delete"]) expect(procedure).toContain(phrase);
  });
});
