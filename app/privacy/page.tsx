import type { Metadata } from "next";
import Link from "next/link";
import { Database, Download, ShieldCheck, Trash2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Gizlilik ve Veri Kullanımı | MediaTracker",
  description: "MediaTracker ilk sürüm gizlilik, veri kullanımı, dışa aktarma ve silme bilgileri.",
};

const CONTACT = "mediatracker.contact@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="app-panel rounded-2xl border p-5 sm:p-6">
      <h2 className="text-base font-semibold text-[var(--app-text-primary)]">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-[var(--app-text-secondary)]">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 rounded-2xl border border-[var(--app-border)] bg-[var(--app-panel-bg)] p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)]">
            <ShieldCheck className="h-5 w-5 text-[var(--app-accent-strong)]" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text-primary)] sm:text-2xl">
              Gizlilik ve veri kullanımı
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--app-text-secondary)]">
              MediaTracker yerel-first çalışır. Bu sayfa ilk sürümde hangi verilerin nerede işlendiğini ve mevcut
              veri kontrol yollarını sade biçimde açıklar; hukuki uygunluk veya sertifika garantisi değildir.
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[var(--app-text-muted)]">Veri sorumlusu / operator</dt>
            <dd className="mt-1 font-medium text-[var(--app-text-primary)]">Batuhan Parıltı</dd>
          </div>
          <div>
            <dt className="text-[var(--app-text-muted)]">Gizlilik ve veri talepleri</dt>
            <dd className="mt-1">
              <a className="font-medium text-[var(--app-accent-strong)] underline underline-offset-4" href={`mailto:${CONTACT}`}>
                {CONTACT}
              </a>
            </dd>
          </div>
        </dl>
      </header>

      <div className="space-y-4">
        <Section title="1. Yerel-first kullanım">
          <p>
            Film, dizi, anime, manga ve kitap kütüphanesi; ilerleme, puan, favori, kişisel not, hedef ve görünüm
            tercihleri giriş yapmadan tarayıcının site depolamasında tutulabilir. Bu yerel veriler kullanılan cihaz
            ve tarayıcı profiline bağlıdır; MediaTracker hesabı açmak zorunlu değildir.
          </p>
          <p>İlk sürümde public yeni hesap kaydı kapalıdır. Önceden yetkilendirilmiş hesaplarla giriş yapılabilir.</p>
        </Section>

        <Section title="2. Hesap, Cloud ve sosyal veriler">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0 text-[var(--app-accent-strong)]" aria-hidden="true" />
            <p>
              Hesap kullanıldığında e-posta ve oturum bilgileri Supabase Auth tarafından; profil, username,
              avatar/banner yolları ve dosyaları, profil görünürlüğü, tema yayını, takip/blok ilişkileri, aktivite,
              yorum, tepki, tavsiye ve bildirim kayıtları Supabase Postgres/Storage tarafından işlenebilir.
            </p>
          </div>
          <p>
            Cloud Media veya Goal eşitlemesi etkinse kütüphane, ilerleme, puan, favori, kişisel not ve hedef verileri
            kullanıcı hesabının owner kapsamıyla Supabase&apos;de saklanır. Bu alanlar başka bir kullanıcının hesabına
            yazılmamalı veya onun özel verisi olarak okunmamalıdır.
          </p>
          <p>
            Tema ve uygulama tercihleri çoğunlukla yereldir. Kullanıcının açıkça kullandığı theme sync ve public
            profile theme özellikleri ilgili seçimi Supabase&apos;de saklayabilir; public profil yalnız yayınlanan,
            doğrulanmış görünümü gösterir.
          </p>
        </Section>

        <Section title="3. Arama sağlayıcıları ve hosting">
          <p>
            İlk sürümde aktif public arama kaynakları TVMaze ve Open Library&apos;dir. Arama sırasında yazdığınız sınırlı
            sorgu ve teknik istek bilgileri uygun kaynağa iletilir. Kişisel kütüphane, ilerleme, puan, favori veya özel
            not içeriği bu sağlayıcılara arama amacıyla gönderilmez.
          </p>
          <p>
            Supabase hesap/veritabanı/dosya hizmetlerini, Vercel ise uygulama hosting ve request runtime&apos;ını sağlar.
            Bu platformlar hizmetin çalışması ve güvenliği için IP, zaman, istek yolu ve benzeri teknik metadata/logları
            kendi yapılandırma ve saklama koşulları kapsamında işleyebilir. Bu sayfa doğrulanmamış bir coğrafi bölge
            veya aktarım hukuki dayanağı iddia etmez.
          </p>
          <p>
            AniList, TMDB ve OMDb yeni public Production aramasında aktif değildir. İlk sürümde server-funded AI ve
            Grounded Research kapalıdır; kullanıcı verisi ücretli bir AI sağlayıcısına gönderilmez.
          </p>
        </Section>

        <Section title="4. Dışa aktarma ve yerel veri kontrolü">
          <div className="flex items-start gap-3">
            <Download className="mt-0.5 h-5 w-5 shrink-0 text-[var(--app-accent-strong)]" aria-hidden="true" />
            <p>
              Ayarlar içindeki veri yönetimi araçları kütüphane, ilerleme ve seçilen portable domainleri JSON olarak
              dışa aktarabilir. Kişisel notların dahil edilmesi portable export seçiminde ayrıca gösterilir. Auth hesabı,
              profil dosyaları ve tüm sosyal/bildirim geçmişi tek uygulama yedeğine dahil değildir.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--app-warning)]" aria-hidden="true" />
            <p>
              Medya kayıtları uygulamada tek tek silinebilir. “Mock verilere sıfırla” işlemi tam silme değildir; mevcut
              kütüphaneyi örnek verilerle değiştirir. Tüm yerel site verisini kaldırmak için tarayıcının MediaTracker site
              verisi temizleme kontrolü kullanılabilir. Önce istenen portable yedeği almak kullanıcının sorumluluğundadır.
            </p>
          </div>
        </Section>

        <Section title="5. Cloud verisi ve hesap silme talepleri">
          <p>
            İlk sürümde güvenli self-service hesap silme ekranı yoktur. Cloud uygulama verisi, profil dosyaları veya Auth
            hesabı için erişim, dışa aktarma ya da silme talebinizi hesabınızda kullandığınız e-posta adresinden
            <a className="mx-1 text-[var(--app-accent-strong)] underline underline-offset-4" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            adresine iletin.
          </p>
          <p>
            Kimlik doğrulaması tamamlandıktan sonra operator talebin kapsamını netleştirir; istenen mevcut export&apos;u
            hazırlar, kullanıcıya ait uygulama satırlarını ve profil dosyalarını siler, ardından yetkili Supabase yolu ile
            Auth hesabını siler ve cleanup sonucunu kontrol eder. Başka bir kullanıcının verisi talep sahibine açıklanmaz.
          </p>
        </Section>

        <Section title="6. İletişim">
          <p>
            Bu açıklama, bir veri talebi veya sağlayıcı kullanımıyla ilgili soru için
            <a className="mx-1 text-[var(--app-accent-strong)] underline underline-offset-4" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            adresini kullanabilirsiniz.
          </p>
          <p>
            <Link href="/" className="font-medium text-[var(--app-text-primary)] underline underline-offset-4">
              MediaTracker&apos;a dön
            </Link>
          </p>
        </Section>
      </div>
    </div>
  );
}
