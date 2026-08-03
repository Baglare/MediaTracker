# Release Calendar Manuel Testleri

## Hazırlık

1. Test/yerel ortamda uygulamayı aç; production Supabase kullanma.
2. Kütüphaneye structured kimlik taşıyan bir TVMaze sezonu, AniList anime ve
   TMDB film ekle. Aynı provider fixture'ları mümkünse bugün–90 gün aralığında
   olay döndürsün.
3. Bir `completed`, bir `dropped`, bir `planning` ve bir `paused` kayıt hazırla.
4. DevTools Network ve Console panellerini temizle.

## Provider, cache ve hata durumları

1. Takvim'i aç; TV, anime ve film olaylarının yalnız kendi provider'ından geldiğini doğrula.
2. TV sezon kartında başka sezon episode'u görünmediğini kontrol et.
3. Başlığına “Season 2” eklenen ama structured sezon identity'si olmayan kaydın
   TVMaze isteği üretmediğini doğrula.
4. `completed`/`dropped` kayıtların ajanda, ay ve TBA'da görünmediğini kontrol et.
5. Yenile'ye bas; pending/loading, refreshing ve last-updated durumlarını gözle.
6. Bir provider'ı geçici olarak engelle. Diğer provider sonuçları kalmalı,
   partial-error görünmeli ve geçerli stale cache kaybolmamalı.
7. Ay değiştir ve tür filtresini aç/kapat; Network'te yeni provider isteği olmamalı.
8. F5 sonrası cache'in aynı owner'da döndüğünü; logout/account switch sonrası
   önceki owner verisinin tek frame görünmediğini kontrol et.

## Ajanda ve aylık görünüm

1. Ajanda varsayılan açılmalı. TV/anime/film filtreleriyle görünen toplamı not et.
2. Ay görünümüne geç; aynı filtrelenmiş olay kümesini ve TBA'nın grid dışında
   kaldığını doğrula.
3. Önceki ayın açılamadığını, 90 günlük ufkun ötesine gidilemediğini ve Bugün
   düğmesinin doğru ay/güne döndüğünü kontrol et.
4. Beş ve altı haftalık ayları, Aralık/Ocak geçişini ve 29 Şubat gününü test et.
5. Dört olaylı bir günde üç kart ve `+1` görünmeli; gün detayında dört olay da olmalı.
6. Date-only olay farklı sistem timezone'larında aynı literal günde kalmalı.
   Exact datetime kullanıcı yerel gününe taşınmalı.

## Manuel olaylar ve gizleme

1. Uygun bir medya için `date_only`, `exact_datetime`, `month_only`, `year_only`
   ve TBA manuel olayları oluştur.
2. Boş başlık ve geçersiz tarih gönder; hata ilgili alan yanında ve screen reader
   ilişkisinde görünmeli.
3. Bir olayı düzenle; `createdAt` korunmalı, `updatedAt` değişmeli. Silmede onay
   diyaloğu çıkmalı.
4. Medyayı `completed` yap; olay saklanmalı fakat görünmemeli. Tekrar `paused`
   yapınca geri görünmeli.
5. Stabil source event ID'li provider olayını gizle, refresh ve F5 yap; gizleme
   korunmalı. Gizlenenler panelinden geri getir.
6. Stable ID taşımayan provider olayı için gizleme aksiyonu çıkmamalı.

## Backup, import ve Cloud V2

1. Portable backup'ta personal-note tercihini ayrıca kontrol ederek export al.
   Manual olay ve hidden key bulunmalı; `releaseCalendarCache` bulunmamalı.
2. Read-only inspector ve additive import ile aynı dosyayı iki kez dene; ikinci
   import yeni manuel event üretmemeli.
3. Record ID remap edilen exact-copy importta manual event `mediaId` yeni record'a
   bağlanmalı.
4. Yalnız `SUPABASE_TEST_*` ile tanımlı disposable projede User A media metadata
   güncellemesi yap. Stale revision ikinci mutation'ı conflict kartına düşürmeli;
   diğer metadata korunmalı ve User B satırı görememeli.

## Responsive ve erişilebilirlik

1. 360 px mobil, tablet ve geniş desktop viewport'ta yatay sayfa taşması,
   üst üste binen kontroller veya kesilen kritik aksiyon olmadığını doğrula.
2. Uzun medya/bölüm adları truncation ile layout'u bozmamalı; boş kapak placeholder göstermeli.
3. Yalnız klavyeyle görünüm/filtre/ay/gün navigasyonu ve manuel formu tamamla.
4. Modal açıldığında odak içeride olmalı; Tab/Shift+Tab dışarı çıkmamalı, Escape
   kapatmalı ve odak açan düğmeye dönmeli.
5. Reduced-motion açıkken gereksiz animasyon olmadığını doğrula.
6. Console'da hydration, maximum update depth, raw stack, provider raw payload
   veya secret bulunmadığını kontrol et.

Otomatik browser altyapısı kurulu değilse bu liste, masaüstü ve mobil kabul
smoke'unun canonical kaydıdır; yapılmayan adımlar başarılı sayılmaz.
