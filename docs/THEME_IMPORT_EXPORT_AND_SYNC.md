# Tema Import/Export ve Opsiyonel Cloud Senkronizasyonu

Bu belge P6.1 tema bundle dosyasını, local-first aktarım akışını ve kullanıcı açıkça etkinleştirdiğinde çalışan private Supabase senkronizasyonunu açıklar.

## Dosya formatı

```json
{
  "format": "mediatracker-theme-bundle",
  "version": 1,
  "exportedAt": "2026-07-23T12:00:00.000Z",
  "application": "MediaTracker",
  "themes": [
    {
      "version": 2,
      "id": "ct_example00",
      "name": "Örnek Tema",
      "createdAt": "2026-07-23T10:00:00.000Z",
      "updatedAt": "2026-07-23T10:00:00.000Z",
      "inputs": {
        "colorScheme": "dark",
        "background": "#101820",
        "surface": "#182733",
        "accent": "#2AA7A1",
        "secondaryAccent": "#C38A5A",
        "textColorMode": "custom",
        "textPrimary": "#F8FAFC",
        "textSecondary": "#D8E0E7",
        "textMuted": "#9AA8B4"
      }
    }
  ],
  "activeTheme": {
    "kind": "custom",
    "id": "ct_example00"
  }
}
```

`activeTheme` opsiyoneldir. Tema tanımı version 1 ise kayıpsız biçimde `textColorMode: auto` kabul edilir; version 2 auto veya üç canonical custom metin rengini taşıyabilir. Dosya türetilmiş semantic token, raw CSS, kullanıcı kimliği, profil, medya, layout, startup, chart palette, profile palette veya cookie bilgisi taşımaz. Effective tokenlar import sırasında canonical girdilerden yeniden üretilir ve kritik kontrast yeniden doğrulanır.

## Dışa aktarma

Tema Stüdyosu içindeki **Tema Aktarımı** alanı iki işlem sunar:

- **Tek tema:** Seçilen custom temayı `mediatracker-theme-<güvenli-ad>.json` olarak indirir.
- **Bütün özel temalar:** Yerel custom kataloğu `mediatracker-themes-YYYY-MM-DD.json` olarak indirir.

Preset tema doğrudan export edilmez; önce Tema Stüdyosu'ndaki “Özel tema olarak kopyala” aksiyonu kullanılmalıdır. Export cloud bağlantısı olmadan çalışır.

## İçe aktarma

1. En fazla 256 KB boyutunda `.json` dosyası seçilir.
2. Uygulama formatı ve her temayı runtime allowlist ile doğrular.
3. Temalar doğrudan kaydedilmez; renk, kontrast, ID ve isim çakışmaları önizlemede gösterilir.
4. ID çakışan her tema için **Atla**, **Mevcut temayı değiştir** veya **Yeni kopya olarak ekle** seçilir.
5. İstenirse dosyadaki aktif custom tema ayrıca uygulanır.
6. Sonuç, eklenen/güncellenen/atlanan/reddedilen sayılarıyla bildirilir.

Bir bozuk kayıt bütün geçerli kayıtları zorunlu olarak engellemez. Bozuk tema reddedilir, geçerli temalar kullanıcı onayıyla kısmi import edilebilir. Toplam katalog hiçbir zaman 20 temayı aşmaz.

## Güvenlik

- Yalnız JSON plain object ve allowlist alanları kabul edilir.
- Renkler canonical `#RRGGBB`; CSS function, URL, gradient ve alpha reddedilir.
- `rawCss`, `style`, `className`, `backgroundImage` ve prototype-pollution anahtarları reddedilir.
- İsim 1–40 karakter, custom ID güvenli `ct_*` biçimindedir.
- Import metni HTML olarak render edilmez.
- Export dosyası private profil veya hesap bilgisi içermez.

## Cloud senkronizasyonu

Cloud tema senkronizasyonu varsayılan kapalı ve cihaz bazlıdır. Açmak için kullanıcı giriş yapmalı, ardından **Cihazlar Arası Senkronizasyon** alanında başlangıç yönünü seçmelidir:

- **Bu cihazı kullan:** Yerel katalog cloud'a gönderilir.
- **Bulutu kullan:** Cloud katalog bu cihaza alınır.
- **Birleştir:** Stable ID üzerinden güvenli merge yapılır.
- **Vazgeç:** Sync kapalı kalır.

Cloud işlemi local tema uygulamasını veya ilk paint'i bloklamaz. Local oluşturma, düzenleme, silme, import ve aktif tema seçimi önce cihazda tamamlanır. Cloud erişilemezse pending durum saklanır; local tema ve export/import kullanılmaya devam eder. Sync kapatıldığında local ve cloud kayıtlar korunur. “Buluttaki tema verilerimi sil” yalnız cloud kaydını siler ve confirmation ister.

## Conflict örnekleri

### Aynı ID, aynı içerik

Tek kayıt kalır; gereksiz kopya üretilmez.

### Aynı ID, farklı içerik

Merge sırasında yerel tema aynı ID ile korunur. Cloud sürümü yeni güvenli ID ve `Tema Adı · Bulut Kopyası` adıyla eklenir. Toplam 20 sınırı aşılıyorsa kayıt eklenmez ve kullanıcıya bildirilir.

### Revision uyuşmazlığı

İki cihaz aynı revision'ı okuduğunda ilk başarılı save revision'ı artırır. Eski revision ile yazan ikinci cihaz `409` conflict alır ve şu seçenekleri görür:

- Bulut sürümünü kullan
- Birleştir
- Güncel revision yeniden okunduktan ve kullanıcı onayladıktan sonra bu cihazı kullan

Uyuşmazlık genel `500` veya sessiz overwrite değildir.

## Migration

Mevcut projede şu yeni migration uygulanmalıdır:

```bash
npx supabase db push
```

Dosya: `supabase/migrations/20260722130000_theme_cloud_sync.sql`

Migration private `user_theme_preferences` tablosunu, self-only RLS select politikasını ve revision kontrollü get/save/delete RPC'lerini ekler. Remote uygulama bu geliştirme turunda yapılmaz.

## Manuel test

1. Tek tema ve bütün temaları export et; JSON içinde yalnız canonical tema alanlarının bulunduğunu kontrol et.
2. Başka bir tarayıcı profilinde import preview, atla/değiştir/kopyala ve F5 kalıcılığını dene.
3. Geçersiz JSON, 256 KB üzeri dosya, raw CSS alanı ve bozuk renk kayıtlarının reddedildiğini kontrol et.
4. İki oturumda sync'i aç; local → cloud ve cloud → ikinci cihaz akışını dene.
5. İki cihaz aynı revision'dan düzenleme yaparak conflict ekranını ve merge'i doğrula.
6. Offline local düzenlemeden sonra pending durumunu, yeniden online olduğunda manuel sync'i kontrol et.
7. Anonim kullanıcıda cloud kontrolünün giriş gerektirdiğini, `/u/[username]` yanıtında custom tema bulunmadığını doğrula.

## Sorun giderme

- **Cloud kontrolleri görünmüyor/çalışmıyor:** Supabase URL/anon key, oturum ve P6.1 migration durumunu kontrol et.
- **Revision conflict:** Önce buluttan yenile; cloud, merge veya açık onayla cihaz seçeneğini kullan.
- **Import teması uygulanmadı:** Import önizlemesindeki “Dosyada seçili olan temayı uygula” seçeneği varsayılan kapalıdır.
- **Bazı temalar import edilmedi:** Geçersiz kayıtları, conflict kararlarını ve 20 tema sınırını kontrol et.
- **Cloud hatası sonrası tema kayboldu sanılıyor:** Tema local-first saklanır; sync durumu hata/pending olabilir fakat local katalog korunur.

Public profil paylaşımı tema bundle/cloud katalogdan ayrı bir güvenlik projeksiyonudur. Version 1 exact 21-token snapshot decode ve route render sırasında aynı deterministic semantic türeticiyi kullanır; private custom ID ve raw theme girdileri public profile payload'ına girmez.
