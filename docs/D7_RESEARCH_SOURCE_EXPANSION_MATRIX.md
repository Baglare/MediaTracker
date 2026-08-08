# D7 Research Source Expansion Matrix

Tarih: 8 Ağustos 2026  
Durum: R2C audit artifact; aşağıdaki source'ların hiçbiri production registry/allowlist'e eklenmemiştir.

Bu matris hukuki izin yerine geçmez. Yeni source ancak resmî API/terms, automated access, attribution, retention, AI inference ve commercial kullanım hakları proje kullanımı için yazılı/tekrarlanabilir biçimde doğrulandıktan sonra R2D adayı olabilir.

| Aday | İçerik / resmî erişim | Terms, attribution, retention ve AI sınırı | Evidence yetkisi | Raw passage / spoiler | Durum |
|---|---|---|---|---|---|
| Fandom | Community MediaWiki prose; teknik API bulunabilir | [Fandom Terms](https://www.fandom.com/terms-of-use-2025-10-14) automated access için express written permission ister ve içerik/AI kullanımını sınırlar | Permission olmadan presence/centrality/absence authority yok; persistent claim yok | Permission olmadan fetch/passage yok; yüksek spoiler riski | `permission_required` |
| Reddit | User posts/comments; Data API | [Reddit Data API Terms](https://redditinc.com/policies/data-api-terms) user content kullanımı, retention/deletion ve AI/ML haklarını ayrıca sınırlar; commercial/expanded use ayrı anlaşma gerektirebilir | Community corroboration bile ayrı izin/policy ister; absence authority yok | User content/PII ve spoiler riski yüksek; persistent passage yok | `prohibited` (mevcut plan/izinle) |
| MyAnimeList | Anime/manga metadata; resmî v2 API | [API reference](https://myanimelist.net/apiconfig/references/api/v2) ve [Terms](https://myanimelist.net/about/terms_of_use) mevcut olsa da review/forum endpoint ve inference/retention izni bu auditte doğrulanmadı | Structured metadata kendi alanında yardımcı olabilir; review presence/centrality/absence yetkisi yok | Review/forum fetch yok; persistence yok | `audit_required` |
| TMDB reviews | Movie review user text; resmî [`/movie/{id}/reviews`](https://developer.themoviedb.org/reference/movie-reviews) endpoint'i doğrulandı | [API Terms](https://www.themoviedb.org/api-terms-of-use?language=en-CA) attribution ister; commercial AI/query-response ve training/validation kullanımlarını ayrıca written agreement kapsamına alır | Teknik olarak presence/centrality için aday; absence yetkisi yok; izin netleşmeden persistent claim yok | Bounded transient passage dahi license/use audit ister; spoiler riski yüksek | `permission_required`; R2D için ilk teknik aday olabilir |
| Trakt | Comments/reviews; resmî API dokümantasyonu var | [API docs](https://trakt.docs.apiary.io/) erişim contract'ı sağlar; [Terms](https://media-og.trakt.tv/terms) content'i personal/non-commercial kullanım ile sınırlar ve yeniden kullanım iznini açıkça vermiyor | Doğrulanmadan presence/centrality/absence authority yok | User text/spoiler; persistent passage yok | `permission_required` |
| Bağımsız MediaWiki toplulukları | Wiki prose; bazıları Action API sağlar | Her domainin terms, robots, lisans, attribution, API etiquette ve content ownership'i ayrı denetlenir; MediaWiki yazılımı ortak lisans garantisi değildir | Domain/source başına trust ve aspect authority gerekir | Revision-bound bounded passage ancak açık lisansla | `audit_required` |
| Resmî yapımcı/yayıncı sayfaları | Synopsis, character/episode/press sayfaları; API çoğunlukla yok | Site bazında automated access, copyright, retention ve citation izni gerekir | Exact identity doğrulanırsa official presence için güçlü; absence çoğunlukla yetkisiz | Kısa transient passage; düşük/orta spoiler, site bazlı | `audit_required` |

## R2D gate

Bir source için en az şu kayıtlar tamamlanmadan adapter yazılmaz:

1. canonical host/API endpoint ve exact identity mapping;
2. automated access ve rate-limit izni;
3. attribution, retention ve derived-claim hakkı;
4. AI inference ile training ayrımının açık sınıflandırılması;
5. source trust class ve presence/centrality/absence yetki matrisi;
6. raw passage TTL/deletion/spoiler politikası;
7. secure direct fetch, fixture ve conditional live test planı.

Fandom/Reddit/MAL/TMDB/Trakt bu aşamada discovery domain'ine, source registry'ye veya network adapter'a eklenmemiştir.
