import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getBackendProvider } from "@/lib/backend/provider";

export const metadata: Metadata = {
  title: "Kişisel Veriler ve Gizlilik | MediaTracker",
  description: "MediaTracker KVKK aydınlatma metni, ilgili kişi hakları ve veri talebi başvuru yöntemi.",
};

const CONTACT = "mediatracker.contact@gmail.com";

const processingGroups = (native: boolean) => [
  {
    title: "Hesap ve kimlik doğrulama",
    basis: "Madde 5/2(c): talep ettiğiniz hesap ve giriş hizmetinin ifası için gerekli veriler; güvenlik işlemleri için aşağıdaki ayrı kapsam geçerlidir.",
    data: native
      ? "E-posta, görünen ad, hesap kimliği, e-posta doğrulama durumu ve oturum bilgileri; girişte şifre işlenir, şifre özeti ve oturum kayıtları Better Auth'un özel PostgreSQL şemasında tutulur. Doğrulama ve şifre sıfırlama için süreli bağlantılar işlenir."
      : "E-posta, hesap kimliği ve oturum bilgileri; girişte şifre işlenir, uygulama tablosunda tutulmaz.",
    purpose: native
      ? "Hesap oluşturmak, e-posta doğrulamasını, parola sıfırlamayı ve oturum güvenliğini sağlamak."
      : "Mevcut kullanıcıların girişini ve oturum güvenliğini sağlamak; kayıt açılırsa hesabı oluşturmak.",
    method: native
      ? "Giriş ve kayıt formu, uygulamanın Better Auth uçları ve oturum çerezleri; otomatik işlemler."
      : "Giriş formu ve hesap/oturum SDK'sı; otomatik işlemler.",
    destination: native
      ? "Better Auth, yapılandırılmış native PostgreSQL ve TürkHosting/Plesk/Passenger uygulama sunucusu; kimlik doğrulama işlemleri."
      : "Yapılandırılmış Supabase Auth ve isteklerin geçtiği Vercel; kimlik doğrulama hizmetleri.",
  },
  {
    title: "Yerel kütüphane, ilerleme, notlar ve hedefler",
    basis: "Madde 5/2(c): talep ettiğiniz takip ve yerel veri bütünlüğü işlevinin yerine getirilmesi. Cihazdan iletilmeyen veri sunucuda tutulmuş sayılmaz.",
    data: "Medya, ilerleme geçmişi, puan, favori, etiket, kişisel not, hedef, takvim ve XP durumu; kurtarma kopyaları.",
    purpose: "Seçtiğiniz medya ve hedefleri takip etmek, ilerlemeyi hesaplamak ve yerel veri bütünlüğünü korumak.",
    method: "Girdi, içe aktarma ve tarayıcı yerel depolaması; otomatik işlemler.",
    destination: "Cihazınızdaki tarayıcı; yalnız yerelde kalan içerik merkezi sunucuya kendiliğinden iletilmez.",
  },
  {
    title: "İsteğe bağlı Cloud eşitlemesi",
    basis: "Madde 5/2(c): seçtiğiniz eşitlemenin ifasına gerekli kayıtlar. Özelliği açmanız genel açık rıza anlamına gelmez.",
    data: "Kütüphane, ilerleme, not, hedef; eşitleme kuyruğu, revizyon ve silindi işaretleri.",
    purpose: "Talep ettiğiniz hesap kapsamlı eşitlemeyi yürütmek ve çakışmaları yönetmek.",
    method: "Etkinleştirilen Cloud yükleme/indirme ve otomatik eşitleme işlemleri.",
    destination: native
      ? "Tarayıcı, uygulama sunucusu ve yapılandırılmış native PostgreSQL; ilgili hizmet altyapısı."
      : "Tarayıcı ve yapılandırılmış Supabase Postgres; ilgili hizmet altyapısı.",
  },
  {
    title: "Profil ve profil dosyaları",
    basis: "Madde 5/2(c): profil hizmetinin ifası; madde 5/2(d): yalnız sizin alenileştirme amacınızla uyumlu alanların yayını. Özel profil bilgileri bu yayın dayanağına dahil değildir.",
    data: "Kullanıcı adı, görünen ad, bio, seçilen profil alanları, görünürlük, avatar/banner ve yayınlanan istatistikler.",
    purpose: "Profili düzenlemek ve açıkça yapılandırdığınız herkese açık alanları yayımlamak.",
    method: "Profil formu, kullanıcı dosya yüklemesi ve otomatik profil üretimi.",
    destination: native
      ? "Yerel tercihler, uygulama sunucusu ve native PostgreSQL; avatar/banner özel dosya sistemi depolamasında, erişim uygulama üzerinden denetlenir; görünürlük kapsamında profil ziyaretçileri."
      : "Yerel tercihler, Vercel, Supabase Postgres/Storage; görünürlük kapsamında profil ziyaretçileri.",
  },
  {
    title: "Sosyal özellikler",
    basis: "Madde 5/2(c): talep ettiğiniz etkileşimlerin ifası; kötüye kullanımı önlemede ölçülü madde 5/2(f); somut uyuşmazlık kanıtında gerekli kapsamda madde 5/2(e).",
    data: "Takip/blok, aktivite, yorum, tepki, tavsiye mesajları, bildirim, rapor ve sosyal XP kayıtları.",
    purpose: "İstediğiniz sosyal etkileşimleri, bildirimleri ve ilerleme durumunu iletmek; raporları değerlendirmek.",
    method: "Sosyal etkileşimler ve otomatik olay/bildirim üretimi.",
    destination: native
      ? "Uygulama sunucusu, native PostgreSQL ve tarayıcı önbellek/kuyrukları; yetkili alıcılar ve görünürlük kapsamındaki kullanıcılar."
      : "Vercel, Supabase Postgres ve tarayıcı önbellek/kuyrukları; yetkili alıcılar ve görünürlük kapsamındaki kullanıcılar.",
  },
  {
    title: "Tercihler ve temalar",
    basis: "Madde 5/2(c): seçtiğiniz görünüm ve tercihlerin uygulanması. Tercih depolaması pazarlama veya reklam izleme amacı taşımaz.",
    data: "Görünüm, yerleşim, başlangıç, sosyal tercihler ve tema seçimleri.",
    purpose: "Seçtiğiniz görünümü uygulamak; kullanılan tema eşitlemesi ve profil tema yayınını yürütmek.",
    method: "Ayarlar girdisi, tarayıcı depolaması/çerezleri ve isteğe bağlı tema eşitlemesi; otomatik işlemler.",
    destination: native
      ? "Çoğunlukla tarayıcı; ilgili özellik kullanılırsa native PostgreSQL ve uygulama sunucusu; yayınlanan tema için profil ziyaretçileri."
      : "Çoğunlukla tarayıcı; ilgili özellik kullanılırsa Supabase ve Vercel; yayınlanan tema için profil ziyaretçileri.",
  },
  {
    title: "Öneriler ve yerel AI durumu",
    basis: "Madde 5/2(c): talep ettiğiniz deterministik önerinin hesaplanması ve oturumun sürdürülmesi; kapalı AI hizmetlerinin etkinleştirilmesine dayanak değildir.",
    data: "Öneri girdisi, seçilmiş kütüphane/bağlam, öneri oturumları, geri bildirim ve yerel AI tercihleri.",
    purpose: "Deterministik önerileri hesaplamak ve öneri oturumunu sürdürmek.",
    method: "Öneri girdisi ve otomatik hesaplama; tarayıcı depolaması ve sunucu isteği.",
    destination: native
      ? "Tarayıcı ve sunucu üzerinden hesaplamada TürkHosting/Plesk/Passenger uygulama sunucusu; yerel-first kullanım her işlemin cihazda kaldığı anlamına gelmez."
      : "Tarayıcı ve sunucu üzerinden hesaplamada Vercel; yerel-first kullanım her işlemin cihazda kaldığı anlamına gelmez.",
  },
  {
    title: "Sağlayıcı aramaları",
    basis: "Madde 5/2(c): talep ettiğiniz katalog işlemi için gerekli veriyle sınırlı. İsteğe bağlı doğrudan dış görsel erişiminde bu gereklilik otomatik varsayılmaz; madde 9 aktarım koşulları ayrıca gerekir.",
    data: "Arama sorgusu, sağlayıcı medya kimliği, alınan katalog bilgileri ve teknik istek bilgileri.",
    purpose: "İstediğiniz katalog aramasını yapmak, medya ayrıntısı/takvim bilgisi ve görsellerini göstermek.",
    method: "Arama girdisi ve otomatik ayrıntı/takvim/görsel istekleri.",
    destination: native
      ? "Uygulama sunucusu, TVMaze ve koşullu Open Library; kaydedilen sonuçlar tarayıcı/Cloud'da, görseller dış sunucularda."
      : "Vercel, TVMaze ve koşullu Open Library; kaydedilen sonuçlar tarayıcı/Cloud'da, görseller dış sunucularda.",
  },
  {
    title: "Güvenlik ve kötüye kullanımın önlenmesi",
    basis: "Madde 5/2(f): hizmeti ve kullanıcıları koruma yönündeki meşru menfaat; asgari metadata ve sınırlı erişimle hak dengesi gözetilir. Madde 12 güvenlik yükümlülüğüne gerekli kapsamda 5/2(ç), somut hak kanıtında 5/2(e).",
    data: "İstek kimliği, zaman, sabit rota, sonuç kodu; sınırlandırma için IP/kullanıcıdan türetilen takma adlı özetler ve raporlar.",
    purpose: "Rotaları kötüye kullanımdan korumak, yetki denetimi ve sınırlı güvenlik kaydı tutmak.",
    method: "Otomatik üretilen istek/güvenlik metadata'sı; kullanıcı rapor girdisi.",
    destination: native
      ? "Uygulama sunucusu, native PostgreSQL sınırlandırma/sosyal kayıtları; barındırma ve ağ altyapısının kendi istek logları ayrıca bulunabilir."
      : "Vercel, Supabase sınırlandırma/sosyal kayıtları; platformların kendi ağ/istek logları ayrıca bulunabilir.",
  },
  {
    title: "Destek ve gizlilik başvuruları",
    basis: "Olağan hizmet desteği için madde 5/2(c); madde 11 ve 13 başvurularına yanıt yükümlülüğü için 5/2(ç); gerekli uyuşmazlık kanıtı için 5/2(e).",
    data: "Gönderen/iletişim bilgisi, talep konusu, gerekli doğrulama ve yanıt yazışmaları.",
    purpose: "Destek ve kişisel veri taleplerini değerlendirmek, kimliği doğrulamak ve yanıtı belgelendirmek.",
    method: "E-posta yazışması; posta altyapısında otomatik, operatör değerlendirmesinde kısmen otomatik işlemler.",
    destination: "Operatörün Gmail posta kutusu ve asgari başvuru kaydı; e-posta hizmet altyapısı ve yetkili operatör.",
  },
];

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
  const native = getBackendProvider() === "native";
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
        <p className="mt-3 text-sm text-[var(--app-text-secondary)]">Son güncelleme: 16 Ekim 2026</p>
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
        <h2 className="text-lg font-semibold text-[var(--app-text-primary)]">A. KVKK Aydınlatma Metni</h2>
        <Section title="Veri sorumlusu ve kapsam">
          <p>
            Veri sorumlusu, gerçek kişi Batuhan Parıltı’dır. Yukarıdaki e-posta gizlilik ve destek iletişim adresidir;
            formal başvuru için aşağıdaki kayıtlı e-posta ve kimlik doğrulama koşulları geçerlidir.
            Bu aydınlatma metni açık rıza metni değildir; hizmet kullanımı bu metni kabul etme koşuluna bağlı değildir.
          </p>
          <p>
            {native
              ? "Native dağıtımda kayıt ayarı etkinleştirildiğinde yeni hesap oluşturulabilir; girişten önce e-posta doğrulaması zorunludur. Kayıt ayarının açılması hukuki değerlendirmelerin tamamlandığı anlamına gelmez. Bu sayfa canlı Auth ayarlarının veya gerçek veritabanı kabulünün doğrulandığı anlamına gelmez."
              : "Mevcut yetkili hesaplar giriş yapabilir. Yeni hesap kaydı ayrı yayın koşullarına bağlıdır. Barındırılan Auth hizmetinde yeni kayıtların kapatılması ayrıca bir yayın yapılandırması gereğidir; bu sayfa canlı Auth ayarlarının doğrulandığı anlamına gelmez."}
          </p>
          {native && (
            <p>
              Bu dağıtımda native PostgreSQL, Better Auth ve özel dosya depolaması kullanılır.
              Supabase alternatifi korunmaktadır. Altyapının işletilmesi yeni sürümün bütün kullanıcı
              akışlarının kabul edildiği anlamına gelmez. TürkHosting koşulları aşağıda operatörün bildirdiği
              yazılı yanıt olarak ayrılmıştır; bağımsız sözleşme veya canlı kabul doğrulaması değildir.
            </p>
          )}
        </Section>

        <Section title="İşlenen veriler, amaçlar ve toplama yöntemi">
          <p>
            Aşağıdaki gruplar hangi verilerin hangi amaçla işlendiğini, toplama yöntemini ve işleme/saklama yerini
            açıklar. Dijital özellikler tamamen veya kısmen otomatik çalışır; destek ve başvuru değerlendirmesi
            insan incelemesini de içerir. Yerel depolama, isteğe bağlı Cloud ve dış servislere giden istekler ayrı akışlardır.
          </p>
          <div className="space-y-5">
            {processingGroups(native).map((group) => (
              <div key={group.title} className="border-t border-[var(--app-border)] pt-4">
                <h3 className="font-semibold text-[var(--app-text-primary)]">{group.title}</h3>
                <dl className="mt-2 space-y-2">
                  <div><dt className="font-medium">Veriler</dt><dd>{group.data}</dd></div>
                  <div><dt className="font-medium">Amaç</dt><dd>{group.purpose}</dd></div>
                  <div><dt className="font-medium">Hukuki dayanak ve sınırı</dt><dd>{group.basis}</dd></div>
                  <div><dt className="font-medium">Toplama yöntemi</dt><dd>{group.method}</dd></div>
                  <div><dt className="font-medium">İşleme yeri ve alıcılar</dt><dd>{group.destination}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Hukuki dayanakların değerlendirilmesi">
          <p>
            KVKK madde 5 kapsamında, hesap/özellik işlemleri için sözleşmenin kurulması veya ifasıyla doğrudan
            bağlantılı gereklilik; güvenlik için temel hak ve özgürlükleri gözeten meşru menfaat; ilgili kişi
            başvuruları için hukuki yükümlülük ve gerekli kanıtların korunması için bir hakkın tesisi, kullanılması
            veya korunması esas alınır. Her dayanak yalnız gerekli işlem kapsamıyla sınırlıdır.
          </p>
          <p>
            Her faaliyet için gereklilik ve ölçülülük sınırı uygulanır; dış aktarım koşullarının doğrulanması yayın kabul
            koşuludur. Profil görünürlük seçimi veya isteğe bağlı Cloud kullanımı tek başına hukuken geçerli açık
            rıza kanıtı değildir. Açık rıza genel bir yedek dayanak olarak kullanılmaz; madde 6 kapsamına giren
            içerikler varsa ayrıca değerlendirilir.
          </p>
          <p>
            Amaç bazında değerlendirme: kayıt/giriş ve talep edilen Cloud/hedef işlemleri için madde 5/2(c);
            profil/sosyal etkileşim için gerekli hizmet işlemleri bakımından 5/2(c), kişinin alenileştirme
            amacıyla sınırlı yayın için 5/2(d); güvenlik için gereklilik ve dengeleme şartıyla 5/2(f), somut
            hukuki yükümlülük varsa 5/2(ç); kurtarma yedekleri için gerekli hizmet sürekliliği bakımından
            5/2(c) veya dengeleme şartıyla 5/2(f); destek için 5/2(c), hak başvuruları için 5/2(ç), gerekli
            uyuşmazlık kanıtı için 5/2(e); sağlayıcı/görsel istekleri için talep edilen hizmete gereklilik
            bakımından 5/2(c) esas alınır. İsteğe bağlı dış görsel
            ve yayın işlemlerinde bu şartlar yoksa ayrı, özgür ve belirli açık rıza veya işlemi sınırlama
            değerlendirilir. Özel nitelikli veri için madde 5 yeterli değildir; uygulanabilir madde 6/3
            şartı ve ek önlemler ayrıca belirlenmelidir.
          </p>
        </Section>

        <Section title="Alıcılar, dış servisler ve yurt dışı işleme">
          <p>
            {native
              ? "Better Auth kimlik doğrulamada, native PostgreSQL hesap ve uygulama verilerinde, özel dosya sistemi avatar/banner depolamasında kullanılır. TürkHosting/Plesk/Passenger barındırma ve sunucu işlemleri için seçilmiştir."
              : "Supabase hesap, veritabanı ve dosya hizmetlerinde; Vercel barındırma ve sunucu işlemlerinde kullanılır."}
            {" "}
            Talep e-postaları operatörün Gmail posta altyapısında işlenir. Profil ve sosyal içerik, seçilen
            görünürlük veya etkileşim kapsamında ilgili kullanıcılara gösterilebilir. Bu servislerin hukuki
            rol sınıflandırması ayrıca incelenmelidir.
          </p>
          {native && <p>
            E-posta doğrulama ve şifre sıfırlama taleplerinde alıcı adresi ve süreli işlem bağlantısı,
            operatörün yapılandırdığı SMTP posta altyapısına iletilir. Bu posta hizmetinin sağlayıcısı,
            işleme yeri, saklama ve yedek koşulları ayrıca doğrulanmalıdır; barındırma yanıtı tek başına
            bu posta akışının koşullarını kanıtlamaz.
          </p>}
          <p>
            TVMaze arama/ayrıntı/takvim erişimi v1 kaynak politikasında teknik olarak açıktır; ayrı hukuki/lisans
            değerlendirmesi yayın kapısıdır. Open Library yalnız geçerli sağlayıcı kimliği/iletişimi yapılandırılırsa
            kullanılabilir; manuel kayıt kapısı ayrıca açıktır. Normal sağlayıcı araması özel kütüphane/notları
            göndermez; yazdığınız sorgu ise ilgili sağlayıcıya iletilir.
          </p>
          <p>
            AniList ve TMDB canlı API erişimi v1 kodunda kapalıdır; OMDb public API erişimi kapalıdır. Eski kayıtlardaki
            metadata veya kapak URL’leri korunabilir. {native
              ? "Sağlayıcı/CDN görselleri tarayıcıdan doğrudan çağrılabilir; native profil dosyaları ise uygulamanın erişim denetimli dosya uçları üzerinden sunulur, özel depolama doğrudan herkese açık değildir."
              : "Sağlayıcı/CDN görselleri ve Supabase imzalı profil dosyaları tarayıcıdan doğrudan çağrılabilir;"}
            {" "}API’nin kapalı olması görsel sunucusuna isteği engellemez.
          </p>
          <p>
            {native
              ? "Operatörün bildirdiği TürkHosting yazılı yanıtına göre belirtilen barındırma hizmetinin uygulama, veritabanı, dosya, log ve yedek işlemleri Türkiye'dedir; bu hizmette yabancı alt işleyen kullanılmaz ve yetkili altyapı personelinin erişimi Türkiye merkezlidir. Bu bilgi bağımsız olarak doğrulanmış sözleşme kanıtı değildir. Yanıt Gmail, TVMaze, dış görsel/CDN, tarayıcı veya operatörün bağımsız yedek kopyalarını kapsamaz; bu ayrı akışlar Türkiye dışında işleme içerebilir."
              : "Vercel, Supabase, posta ve diğer dış servisler gerçek altyapı/yapılandırmaya göre Türkiye dışında veri işleyebilir."}
            {" "}Tarayıcıdan doğrudan dış sunuculara yapılan istekler IP ve istek metadata’sını o sunucuya
            gösterebilir. Kesin bölge, platform logları ve saklama koşulları uygulama kaynak koduyla belirlenemez.
            Yurt dışı aktarım için madde 9 mekanizması ayrı operatör/hukuk kanıtı gerektirir; henüz kesinleştirilmemiştir.
          </p>
        </Section>

        <Section title="İlgili kişinin hakları">
          <p>KVKK madde 11 kapsamında kendinizle ilgili şu haklar için başvurabilirsiniz:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Kişisel verilerinizin işlenip işlenmediğini öğrenmek.</li>
            <li>İşlenmişse buna ilişkin bilgi istemek.</li>
            <li>İşleme amacını ve verilerin bu amaca uygun kullanılıp kullanılmadığını öğrenmek.</li>
            <li>Verilerin yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri öğrenmek.</li>
            <li>Eksik veya yanlış işlenen verilerin düzeltilmesini istemek.</li>
            <li>Kanunun 7. maddesindeki koşullar kapsamında silme veya yok etme istemek.</li>
            <li>Düzeltme, silme veya yok etmenin verilerin aktarıldığı üçüncü kişilere bildirilmesini istemek.</li>
            <li>Yalnızca otomatik analiz sonucu aleyhinize ortaya çıkan sonuca itiraz etmek.</li>
            <li>Kanuna aykırı işleme nedeniyle uğradığınız zararın giderilmesini istemek.</li>
          </ul>
          <p>
            Silme/yok etme talepleri uygulanabilir koşullar ve saklama yükümlülükleriyle birlikte değerlendirilir;
            her talebin istendiği biçimde yerine getirileceği taahhüt edilmez.
          </p>
          <p>
            <a className="underline underline-offset-4" href="https://www.kvkk.gov.tr/Icerik/2036/Ilgili-Kisinin-Haklari">
              KVKK Kurumunun ilgili kişi hakları açıklaması
            </a>
          </p>
        </Section>

        <Section title="Başvuru yöntemi">
          <p>
            Bilgi/erişim, düzeltme, silme/yok etme, alıcı/aktarım bilgisi, uygulanabilir itiraz veya diğer madde 11
            taleplerinizi
            <a className="mx-1 break-all text-[var(--app-accent-strong)] underline underline-offset-4" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            adresine iletebilirsiniz. Hesap kullanıyorsanız hesabınıza kayıtlı e-posta adresinden yazın.
          </p>
          <p>
            Olağan e-postanın formal başvuru kanalı sayılabilmesi için gönderici adresi ilgili kişi tarafından
            daha önce bildirilmiş ve MediaTracker sisteminde kayıtlı olmalıdır. Eşleştirilemeyen e-postalar
            ilk talep/destek kaydı olarak alınır; operatör ölçülü ek doğrulama isteyebilir. Kimlik doğrulanmadan
            hesap verisi açıklanmaz. Kayıtlı e-postaya dayanan formal kanal kapsamı kısmidir; daha geniş kapsam
            ayrıca operatör/hukuk değerlendirmesi gerektirir.
          </p>
          {native && (
            <p>
              Native akışta giriş için e-posta doğrulaması gerekir. Yapılandırılmış SMTP üzerinden doğrulama ve şifre sıfırlama bağlantıları gönderilir; gerçek teslimat ayrıca doğrulanmalıdır.
              Kayıtta yazılmış adres veya o adresten gelen mesaj tek başına hesap sahipliğini kanıtlamaz;
              hesap verisi açıklama, silme ve sahiplik değişiklikleri için ayrıca güvenli doğrulama gerekir.
            </p>
          )}
          <p>
            Başvuruda ad/soyad, talep konusu ve tebligata esas yerleşim veya iş yeri adresi; formal başvuru için
            mevzuatın gerektirdiği kimlik bilgileri (Türkiye Cumhuriyeti vatandaşları için T.C. kimlik numarası;
            yabancılar için uyruk, pasaport veya varsa kimlik numarası), varsa bildirim e-postası/telefon ve yazılı
            başvuruda imza gibi uygulanabilir unsurlar bulunmalıdır. Gerekli bilgilerin güvenli iletimi için önce
            operatörle iletişime geçebilirsiniz; bu sayfada kimlik numarası toplayan bir form yoktur.
          </p>
          <p>
            Hesap şifrenizi, oturum token’ını, kimlik doğrulama çerezini, API anahtarını veya gereksiz tam kimlik
            kartı taramasını göndermeyin. Doğrulama talebin kapsamına göre asgari ve ölçülü olmalıdır.
          </p>
          <p>
            Alınma tarihi kaydedilir; kanal ve kimlik kontrolünden sonra kapsam belirlenir. Başvuru niteliğine göre
            mümkün olan en kısa sürede ve en geç 30 gün içinde yazılı veya elektronik yanıt verilmesi esastır.
            Ek doğrulama bu süreyi kendiliğinden yeniden başlatmaz. Yanıt, kabul edilen işlemleri veya gerekçeli
            ret/kısmi kabulü ve mevcut teknik sınırlamaları açıklar. Talebin alınması, tüm teknik işlemlerin hemen
            kullanılabilir olduğu anlamına gelmez.
          </p>
          <p>
            Başvuru reddedilirse, yanıt yetersizse veya süresinde yanıt verilmezse uygulanabilir kanuni süreler
            içinde Kişisel Verileri Koruma Kuruluna şikâyet hakkınız bulunabilir.
            <a className="ml-1 underline underline-offset-4" href="https://www.kvkk.gov.tr/Icerik/2062/Basvuru-Hakki">
              KVKK Kurumunun başvuru hakkı açıklaması
            </a>
          </p>
        </Section>

        <h2 className="pt-4 text-lg font-semibold text-[var(--app-text-primary)]">B. Ek gizlilik ve veri kontrolü bilgileri</h2>
        <Section title="Hassas içerik ve öneri işlemleri">
          <p>
            MediaTracker normal özelliklerinde özel nitelikli kişisel veri sağlamanızı istemez. Not, bio, yorum,
            tavsiye mesajı, rapor ve destek yazışması gibi serbest metinlere kullanıcı kendi isteğiyle bilgi girebilir.
            Gereksiz sağlık, biyometrik, siyasi, dini, ceza mahkûmiyeti veya benzeri hassas bilgileri eklemeyin.
            Olağan medya tercihleri tek başına özel nitelikli veri olarak sınıflandırılmaz.
          </p>
          <p>
            V1 politika hedefinde server-funded AI, ücretli AI sağlayıcıları, araştırma ve kalıcı embedding önbelleği
            kapalıdır. Canlı ortam değerleri bu sayfayla doğrulanmaz. Deterministik öneri işlemleri seçilen bağlamı
            sunucuya gönderebilir; yerel öneri oturumları/geri bildirimler tarayıcıda ayrıca saklanabilir.
          </p>
        </Section>

        <Section title="Saklama süreleri ve sınırları">
          <p>
            Tarayıcıdaki veriler kullanıcı, uygulama veya tarayıcı site verisi temizleme işlemlerine kadar kalabilir;
            mevcut kaydı silmek kurtarma/yedek kopyalarını mutlaka kaldırmaz. Hesap/Cloud verisi genel olarak
            hesap ve özellik yaşam döngüsüne bağlıdır; bu ifade tam silme veya kesin süre garantisi değildir.
          </p>
          <p>
            Mantıksal silme (tombstone), işlem ve eşitleme kayıtları ayrı teknik yaşam döngülerine tabidir.
            Güvenlik sınırlandırma durumunun sınırlı operasyonel yaşam döngüsü fiziksel temizleme ya da platform
            yedeği/loglarının silinmesiyle aynı değildir. Platform logları kendi koşullarına tabidir. Destek posta
            kutusu için ayrı saklama politikası uygulanır: olağan destek yazışmaları talebin kapanışından itibaren
            90 gün, KVKK başvuru ve yanıt kayıtları kapanıştan itibaren 12 ay tutulur. Bunlar operatörün
            belirlediği sürelerdir; kanunun zorunlu kıldığı süreler değildir. Gereksiz kimlik kanıtı ve export
            ekleri teslim/doğrulama tamamlanınca daha erken kaldırılır. Somut uyuşmazlık, hukuki yükümlülük veya
            hakkın korunması için gerekli kayıtlar gerekçesi ve gözden geçirme tarihiyle ayrı tutulabilir;
            gerekçe sona erince silinir. Silme/yok etme işlem kayıtları ilgili mevzuat gereği en az üç yıl saklanır; bu kayıtlar silinen içeriğin kopyasını içermez. Posta kutusu temizliği operatör tarafından yapılır, uygulama otomatik silmez.
          </p>
          {native && (
            <p>
              Operatörün bildirdiği TürkHosting yazılı yanıtına göre hosting yedekleri günlük alınır ve
              yaklaşık dört haftalık saklama/rotasyona tabidir. Bu, belirli bir hesabın son kopyasının
              kesin silinme tarihi veya özel dosyaların tutarlı yedeklendiği/geri yüklenebildiği kanıtı değildir.
              Operatörün bağımsız şifreli yedek kopyaları ayrı saklama, erişim ve silme politikasına tabidir;
              hosting rotasyonu bu kopyaları temizlemez. Silinen hesapların geri yüklemede yeniden açılmasını
              önleyecek uzlaştırma ayrıca gerekir. Hosting web logları IP, zaman, istek ve User-Agent içerebilir;
              barındırma loglarının saklama süresi de kesinleşmemiştir. Özel dosya depolaması yedeklerin veya
              logların silindiğine ilişkin garanti değildir.
            </p>
          )}
        </Section>

        <Section title="Dışa aktarma, yerel kontrol ve hesap silme sınırları">
          <p>
            Tarayıcı-yerel veriler hiç MediaTracker backend’ine iletilmemiş olabilir. Uygulama/tarayıcı kontrolleriyle
            yönetilebilir. Mevcut self-service dışa aktarma kısmidir: portable yedek kütüphane, ilerleme, kimlik
            eşlemeleri, yönlendirmeler, öneri bağlantıları ve hedefler gibi desteklenen alanları kapsar; notları
            dahil etme seçimi vardır. Tema dışa aktarımı ayrıdır. Portable yedek tam hesap dışa aktarımı değildir.
          </p>
          <p>
            Cloud/hesap verisi ayrıdır. Auth, profil dosyaları ve sosyal/bildirim geçmişinin kapsamlı dışa aktarımı
            operatör yardımı gerektirebilir; tüm hesap dışa aktarımının ve silmenin teknik kapsamı ayrıca bildirilir.
            {native && " Native hesap export aracı ve korumalı operatör silme akışı mevcuttur; tek test hesabındaki başarılı işlem bütün kullanıcı ve yedek kopyalarının silindiği anlamına gelmez."}
            {" "}İlk sürümde self-service hesap silme ekranı yoktur. Silme talepleri operatör
            yardımıyla değerlendirilir; teknik tamamlanma kanıtı ve bazı alıcı/platform kayıtları ayrı işlem gerektirir.
          </p>
          <p>
            Çıkış yapmak veri silmek değildir. “Mock verilere sıfırla” kütüphaneyi örnek verilerle değiştirir;
            tam silme değildir. Yerel medya kayıtları tek tek silinebilir; tüm site verisi için tarayıcı kontrolü
            kullanılabilir. İstenen desteklenen yedeği silmeden önce alın; indirilen kopyalar ayrıca korunmalıdır.
          </p>
        </Section>

        <Section title="İletişim ve açık değerlendirmeler">
          <p>
            Madde 9 aktarım mekanizması, VERBİS istisnasına ilişkin işletmesel bilgilerin doğrulanması,
            formal başvuru kanalının kapsamı ve hosting log/yedek koşulları ayrı operatör değerlendirmeleridir.
            Bu sayfa bunların tamamlandığını göstermez.
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
