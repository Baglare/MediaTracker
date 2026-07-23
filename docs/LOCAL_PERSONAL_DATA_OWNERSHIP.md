# Yerel Kişisel Veri Sahipliği

## Kapsam

D1B.2B; yerel profil fallback'i, custom tema kataloğu/seçimi, theme cloud-sync
metadata'sı ve AI Advisor kişisel durumunu D1B.2A `LocalOwnerScope` modeline bağlar.
Media library namespace'i ve cloud şemaları bu aşamada değişmez.

## Owner modeli ve anahtarlar

- Signed-out kullanım `guest` scope'udur.
- Authenticated kullanım Supabase `auth.uid()` değerinden üretilen `user:<id>` scope'udur.
- Anahtarlar `buildPersonalDataKeys` ile
  `mediaTracker:personal:v1:<scope>:<domain>` biçiminde üretilir.
- Domain'ler `profilePreferences`, `customThemes`, `themeSelection`,
  `themeCloudSync`, `aiSession`, `aiFeedback` ve `aiPreferences` olarak ayrıdır.

Her current kaydı `mediatracker-personal-data` formatı, domain, schema version,
owner scope ve write zamanı taşır. Key/envelope owner uyuşmazlığı açılmaz veya
overwrite edilmez. Temp/current/backup read-back protokolü ve domain codec'i
başarılı olmadan write başarılı sayılmaz.

## Profil sahipliği

Profile preferences ve `avatarImageDataUrl` yalnız eşleşen owner scope'tan okunur.
Cloud social profile authenticated kullanıcı için ana kaynaktır; yerel kayıt
offline/eksik alan fallback'i ve son bilinen güvenli cache'tir. Cloud avatar,
yerel data URL fallback'inden önce gelir. Yerel data URL kendiliğinden upload
edilmez. `socialAvatarMigrationDismissedFor` da profil envelope'u içinde
owner-scoped kalır.

Auth pending veya account switch sırasında önceki owner profili görünür değildir.
Cloud profile fetch sonucu da başladığı owner ile eşleşmiyorsa yeni owner
sunumuna uygulanmaz.

## Custom tema sahipliği ve seçim katmanı

Preset tema registry ortak ve salt-okunurdur. Kullanıcının custom tema kataloğu
owner-scoped'tur; 20 tema sınırı owner başına uygulanır. Import/export mevcut
runtime kataloğunu kullandığından yalnız aktif owner'ı etkiler.

Appearance iki katmandır:

- Device: preset fallback, accent, density, effects, chart palette ve
  world-completed davranışı.
- Owner: aktif custom tema referansı.

Owner değişirken katalog/seçim doğrulanana kadar device preset kullanılır.
Eksik custom ID owner seçiminden temizlenir ve güvenli preset'e düşer. Server
ilk paint'te owner bilgisi bulunmadığından custom cookie snapshot uygulanmaz;
custom tema client owner hydration'ından sonra etkinleşir. Bu tercih ilk paint
custom renk gecikmesi karşılığında başka owner tokenlarının görünmesini engeller.

## Theme cloud-sync metadata'sı

`enabled`, `lastRemoteRevision`, `lastSyncedAt`, `lastError` ve
`pendingLocalChanges` user scope'unda saklanır. Guest sync yapamaz. Logout sync'i
durdurur. Auth değişiminde generation değeri artar; eski fetch/save/delete
yanıtları yeni owner'ın remote veya revision state'ini güncelleyemez. Eski global
sync revision/error metadata'sı hiçbir owner'a migrate edilmez.

## AI state sahipliği ve privacy

AI verisi üç ayrı envelope kullanır:

- `aiSession`: en fazla 8 geçmiş oturum ve bounded aktif snapshot.
- `aiFeedback`: allowlist feedback eventleri, en fazla 100 dismissed sinyali ve
  1000 recommendation feedback event'i.
- `aiPreferences`: danışman ayarları, scope/research seçimi ve veri izinleri.

Message/prompt stringleri, event/action/media-type alanları ve tarih/ID'ler
runtime codec ile sınırlandırılır. Unknown/oversize kayıtlar canonical state'e
taşınmaz. API key, server secret, raw provider promptu veya personal note içeriği
preference envelope'una eklenmez.

Personal-note kullanım izni yeni owner'da kapalıdır. Legacy AI state bir hesaba
explicit atanırken eski `usePersonalNotes` ve `notes` değerleri yeniden kapatılır;
kullanıcı yeni scope'ta tekrar onay vermelidir. Mevcut client'ta kişisel local
provider endpoint/model anahtarı bulunmadığından provider/model adresi migration
edilmez; `useOpenAIProvider` danışman davranış tercihi olarak owner-scoped kalır.

## Legacy migration ve sahiplik paneli

Global profil, custom tema ve AI anahtarları authenticated kullanıcıya otomatik
atanmaz. Ayarlar'daki “Eski kişisel yerel veriler bulundu” paneli her domain için
ayrı olarak şunları sunar:

- Bu hesap için kullan
- Guest olarak sakla
- Şimdilik ertele
- Yalnız backup olarak koru

Panel yalnız güvenli kayıt sayısı/izin özeti gösterir; avatar data URL, AI mesajı
ve personal note içeriği göstermez. Hedef doluysa silent replace/merge kapalıdır.
Karar marker'ı owner ve source fingerprint taşır; User A kararı User B'ye
uygulanmaz. Deferred kayıt panelden yeniden ele alınabilir.

Signed-out açılışta geçerli global veri raw backup sonrasında guest scope'a
kopyalanabilir. Global kaynak silinmez. Bozuk kaynak target envelope üretmez.
Quota veya verification hatasında mevcut source/current korunur.

## Device-scoped tercihler

Density, effects, chart palette, dashboard/right-rail layout ve startup tab
auth değişiminde korunur. Bunlar owner envelope'larına taşınmaz. “Device-scoped”
kararı custom tema, profil veya AI state'in henüz taşınmamış olması anlamına
gelmez; bu üç domain artık açıkça owner-scoped'tur.

## Auth geçişi

Owner key değiştiği anda görünür profil, custom katalog/seçim ve AI state
hydrated-owner eşleşmesiyle maskelenir. Yeni scope codec doğrulamasını geçtikten
sonra açılır. AI in-flight request kimliği, profile fetch abort/owner eşleşmesi ve
theme-sync generation kontrolü stale sonucun yeni owner state'ine yazmasını
engeller. Logout authenticated state'i guest state olarak yeniden etiketlemez.

## Sınırlar

- D1C canonical media identity ve duplicate taraması bu modele eklenmez.
- D2 media cloud PK/revision/tombstone ve conflict motorunu ele alır.
- D5 AI V2 scoring, feedback decay ve ML profilini ele alır.
- Multi-key Web Storage gerçek transaction veya cross-tab lock sağlamaz.
- Merkezi backup/restore ve quarantine yönetim UI'si D1D/D1E/D1F kapsamındadır.

## Manuel smoke

1. Guest profil, custom tema ve AI feedback oluştur.
2. User A ile giriş yap; domain kararlarını ayrı uygula ve sayfayı yenile.
3. User B'ye geç; A avatarı, tema adı/renkleri ve AI geçmişinin görünmediğini doğrula.
4. B için farklı profil/tema oluştur; A'ya dönüp A verisinin geri geldiğini doğrula.
5. Density, layout ve startup tab'ın owner geçişlerinde değişmediğini doğrula.
6. Theme sync revision/pending değerlerinin A/B arasında ayrıldığını doğrula.
7. Logout sonrası guest verisinin geri geldiğini doğrula.
