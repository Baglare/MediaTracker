# Release Calendar — 3–5 Dakikalık Demo

## 0:00–0:45 — Tek event modeli

Takvim sekmesini aç. Ajandada TVMaze sezon bölümleri, AniList anime yayınları ve
TMDB film tarihlerini göster. TV/anime/film provider eşlemesinin structured
identity üzerinden yapıldığını; başlık tahmini olmadığını belirt.

## 0:45–1:30 — Ajanda ve ay

Ajanda gruplarını göster, ardından Ay görünümüne geç. Bugün, 90 günlük horizon,
Pazartesi başlangıcı, gün başına üç olay ve `+N` detayını göster. Tür filtresini
değiştirerek iki görünümün aynı normalize event kümesini kullandığını anlat.

## 1:30–2:30 — Local-first cache

Yayınları yenile'yi kullan. 12 saatlik owner-scoped cache, en fazla üç eşzamanlı
istek ve stale-while-revalidate davranışını göster. Bir provider hata fixture'ı
varsa partial-error durumunda diğer olayların kaldığını vurgula.

## 2:30–3:30 — Kalıcı kullanıcı verisi

Bir medyaya TBA veya date-only manuel yayın ekle, düzenle ve silme onayını göster.
Bir provider olayını gizleyip Gizlenen yayınlar panelinden geri getir. Otomatik
cache'in yeniden üretilebilir; manual/hidden verinin media metadata'sına bağlı
kalıcı kullanıcı verisi olduğunu açıkla.

## 3:30–4:15 — Güvenlik ve recovery

Portable backup özetinde manual takvim verisinin taşındığını, provider cache'in
taşınmadığını göster. Owner değişiminde önceki hesabın cache/manuel verisinin
görünmediğini ve cloud mutation'ın mevcut revision conflict akışını kullandığını
belirt.

## 4:15–5:00 — Teknik kapanış

Date-only değerlerin UTC'ye zorlanmadığını, exact datetime'ın kullanıcının yerel
gününde gruplandığını ve provider boş sonucundan sahte TBA üretilmediğini özetle.
Sınırı açıkla: 90 günlük yayın ufku vardır; notification, harici takvim export'u
ve streaming availability bu sürümde yoktur.
