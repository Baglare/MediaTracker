# D7-0 — Veri ve Lisans Audit'i

Tarih: 6 Ağustos 2026
Durum: D7-0 teknik data-governance kararı; hukuk görüşü değildir.

## Karar özeti

- D7 dataset'i gerçek kullanıcı verisi, raw provider payload'ı, görsel veya uzun provider açıklaması içermez.
- “Public API” eğitim izni değildir. Açık eğitim/validation hakkı yoksa kaynak `training_allowed` değildir.
- Yeni verifier candidate + aspect için ordinal evidence üretir; final seçim, eligibility ve sıra deterministic V2'de kalır.
- D7-1 pilotu sentetik ve bağımsız insan-yazımı kısa özetlerle başlar. Provider kayıtları en fazla exact identity ve annotation reference olarak kullanılır.
- AniList ve OMDb training corpus değildir. TMDB içeriği yazılı izin olmadan ML training/validation'a girmez. TVMaze ve Open Library ancak ayrı field-level lisans/provenance incelemesinden sonra training adayı olabilir.
- D7-0'da provider katalog isteği, model/dataset indirme, veri toplama veya model eğitimi yapılmadı.

## Resmî kanıt kaynakları

| Kaynak | Resmî belge | Audit sonucu |
| --- | --- | --- |
| AniList | [API Terms of Use](https://anilist.gitbook.io/anilist-apiv2-docs/docs/guide/terms-of-use) | Non-commercial temel kullanım; mass collection/hoarding yasak; tracker/competing service riski ve ticari eşik ayrıca izin sürecine bağlı. |
| TVMaze | [API — Licensing](https://www.tvmaze.com/api) | API verisi CC BY-SA; attribution ve ShareAlike zorunlu. Görsel hakları aynı varsayıma sokulmaz. |
| TMDB | [API Terms of Use](https://www.themoviedb.org/api-terms-of-use) | TMDB Content ile ML/AI training veya validation ve bunun için dataset/cache açıkça yazılı anlaşma gerektirir; D7 dataset/verifier girdisi bloklu. |
| OMDb | [API](https://www.omdbapi.com/) ve [Terms](https://www.omdbapi.com/legal.htm) | Site CC BY-NC 4.0 bildirir; terms personal/non-commercial, no-indexing ve no-derivative sınırlamaları taşır. Training/derived dataset izni çıkarılamaz. |
| Open Library | [API usage](https://openlibrary.org/developers/api), [licensing](https://openlibrary.org/developers/licensing), [bulk data](https://openlibrary.org/data) | API low-volume human-facing lookup içindir; bulk için dump kanalı ayrıdır. IA yeni hak iddia etmez fakat contribution/source hakları belirsiz olabilir. Facts ile description ayrı audit edilir. |
| Wikidata/Wikipedia | [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing), [Wikimedia Terms](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use) | Wikidata structured main data CC0; Wikipedia metni genel olarak CC BY-SA ve ek şartlara tabidir. Tek “Wikimedia açık” etiketi yeterli değildir. |
| Hugging Face | [Model cards](https://huggingface.co/docs/hub/en/model-cards), [dataset cards](https://huggingface.co/docs/hub/datasets-cards) | Hub kaydı başına license/card/training-data audit gerekir; platformda bulunmak yeniden kullanım izni değildir. |

Şartlar değişebilir. Her dataset/model manifest'i `licenseAuditVersion` taşır; provider şartı değişirse ilgili source policy invalid edilir ve artifact yeniden yayınlanmaz.

## D7 veri kullanım matrisi

Kısaltma: `A` attribution; `R` redistribution; `T` derivative/training; `PD` personal-data riski. Retention, D7 artifact'i içindir; production runtime cache sözleşmesi ayrıca kalır.

| Source name | Content types | Current intended use | Class | License/terms source | A / R / T | Retention ve bulk | PD / commercial ayrımı | Confidence | Final D7 policy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AniList API metadata | Exact ID, media type, format/status, factual counts, genre, ranked tag; description hariç | Runtime recommendation evidence ve annotation sırasında identity/reference | `runtime_only` | AniList API Terms | A: ürün kaynağı göster; R: corpus yok; T: açık izin yok | Response cache mevcut bounded TTL; dataset snapshot/bulk yok; mass collection yasak | Public metadata düşük PD; user list alanları yasak. Commercial eşik/izin ve tracker riski D8'e bağlı | confirmed | D7 train/eval text'ine girmez. Exact identity ve bounded taxonomy adı yalnız runtime reference olur. |
| TVMaze API metadata | Exact ID, type, language/country/status, genre, factual episode alanları; image hariç | Runtime evidence; bounded internal evaluation snapshot adayı | `evaluation_snapshot_allowed` | TVMaze API licensing CC BY-SA | A zorunlu; R ShareAlike uyumlu; T model/derived DB uyumu ayrıca incelenir | Snapshot en çok 90 gün; D7-0 bulk yok. Public show index var diye corpus çekilmez | Düşük PD; CC BY-SA ticari kullanıma izin verse de attribution/SA korunur | conditional | Sadece factual bounded snapshot; training split'e hukuk/compatibility review olmadan girmez. |
| TMDB API metadata | Exact ID, genre/keyword, language/country, runtime/counts, scores; overview/image hariç | Mevcut runtime provider entegrasyonu; D7 learned verifier için kullanılmayacak | `training_requires_permission` | TMDB API Terms | A runtime'da zorunlu; R/derivative/ML training-validation yazılı anlaşmasız yasak | Mevcut bounded runtime cache dışında D7 retention yok; bulk yok | Public metadata düşük PD; commercial use ayrıca yazılı agreement ister | confirmed | TMDB Content D7 annotation text'i, eval snapshot'ı, training input'u veya verifier feature'ı olamaz; yazılı izin blocker. |
| OMDb API metadata | IMDb ID, year/runtime/genre/rating, short/full plot; poster hariç | Runtime secondary identity/verification | `runtime_only` | OMDb API + Terms | A gerekli; R/derivative/index sınırlı; T açık izin yok | Mevcut bounded runtime cache; D7 snapshot/bulk yok | Düşük PD; CC BY-NC ve personal/non-commercial terms ticari kullanımı ayırır | confirmed | Training/eval corpus yok; plot/response repoya girmez. Yalnız runtime secondary verification. |
| Open Library API metadata | Work/edition ID, ISBN, author, year/pages/language/subjects; description ayrı | Runtime book evidence; annotation reference | `annotation_reference_only` | OL API/licensing/data pages | Catalog facts için geniş kullanım niyeti; contribution/source hakları değişken. Description otomatik açık sayılmaz | API low-volume; reference en çok 90 gün. Bulk gerekirse dump kanalı ve ayrı D7 kararı | Public catalog düşük PD; reading logs/ratings kullanılmaz. Mission-alignment/commercial uygunluk ayrıca incelenir | conditional | Exact work/edition + facts referans olabilir. Description/subject training'e ancak field-level source/license provenansı ile girer. |
| Kullanıcı kişisel notları | Free text, spoiler, hassas kişisel bilgi | Hiçbiri | `prohibited_or_unresolved` | Ürün gizlilik kararı | A/R/T yok | Dataset'e hiç yazılmaz; retention yok; bulk yok | Çok yüksek PD; ticari/non-commercial ayrımı sonucu değiştirmez | confirmed | Yasak. Model input, annotation ekranı, export, public dataset ve training dışında. |
| Rating/favorite/progress/feedback | Davranış ve tercih sinyalleri, free-text feedback olabilir | Deterministic V2 personal-fit runtime'ı; D7 modeline değil | `prohibited_or_unresolved` | Ürün gizlilik kararı | A/R/T yok | Dataset'e hiç yazılmaz | Yüksek linkability ve profil çıkarımı riski | confirmed | D7 verifier input/training/evaluation'da yasak. D7-4 dahi açık yeni consent kararı olmadan kullanamaz. |
| Sentetik kısa özetler | Proje için üretilen 600 karaktere kadar mini senaryo | Pilot/gold annotation ve training adayı | `training_allowed` | Proje source policy + generation log | A proje politikasına göre; R manifest'e göre; T izinli | Süresiz olabilir; hash/version zorunlu; provider katalog türetimi yok | PD olmamalı; commercial ayrım source policy'de açık | conditional | Kaynak prompt'u kişisel/provider metni içermiyorsa, review approved ve provenance varsa training'e girebilir. |
| İnsan tarafından yeniden yazılmış kısa özet | Bağımsız, 600 karaktere kadar içerik özeti | Gold annotation ve training adayı | `training_allowed` | Contributor agreement + reviewer kaydı | A/R/T agreement'a göre | Internal artifact; revocation halinde sil; provider uzun metni yakın paraphrase etme | Annotator kimliği pseudonymous; eserden telifli ifade kopyalama riski var | conditional | Bağımsız anlatım, kısa boyut ve reviewer approval zorunlu. Long quote/close paraphrase reddedilir. |
| Açık lisanslı üçüncü taraf dataset | Text/metadata/label, kaynağa göre değişir | Gelecekte baseline adayı | `training_requires_permission` | Dataset LICENSE + data card + upstream sources | A/R/T dataset bazında | İndirme D7-0'da yok; onay sonrası pinned snapshot ve revocation policy | PD ve commercial hüküm dataset bazında | unresolved | Genel kategori olarak training_allowed değildir. Her dataset ayrı audit ile yeni source policy alır. |
| Wikipedia/Wikidata benzeri açık kaynak | Wikidata structured facts; Wikipedia prose | Field-level açık kaynak adayı | `training_requires_permission` | Wikimedia/Wikidata resmî lisansları | Wikidata CC0; Wikipedia CC BY-SA attribution/SA | D7-0 snapshot yok; dump/API seçimi sonraki karardır | PD genelde düşük; biography/people alanlarında dikkat. Commercial izin lisans koşullarına bağlı | conditional | Wikidata facts ayrı policy ile training_allowed olabilir; Wikipedia prose aynı policy'yi devralamaz. |
| Hugging Face model/dataset kaynakları | Model weights/card; dataset files/card | D7-2 candidate audit | `training_requires_permission` | Her repo model/data card + LICENSE + upstream | Repo bazında | D7-0 download yok; commit hash/model hash olmadan artifact yok | Training-data transparency ve commercial/non-commercial repo bazında | unresolved | Model/dataset başına license, upstream data, TR/EN, export ve commercial audit bitmeden seçilmez. |
| Mevcut test fixture'ları | 15 sentetik contract seed'i ve provider-shape fixture'ları | Regression/evaluation contract | `evaluation_snapshot_allowed` | Repository içi proje fixture policy | R proje kod lisansına göre; T kalite gold'u olarak değil | Git'te versioned; gerçek provider payload eklenmez | PD false invariant'ı var | confirmed | Contract regression için kalır; training/gold kalite dataseti sayılmaz. |

## Provider alan ve retention kararı

Mevcut Recommendation V2 provider evidence cache'i memory-only, max 256 entry ve provider bazlı 30 dakika–24 saat TTL kullanır. Bu runtime cache dataset değildir. D7 artifact'i için daha dar politika:

| İçerik | Maksimum | Retention |
| --- | ---: | --- |
| Title | 300 karakter; yalnız yardımcı alan | Exact identity yanında; title identity değildir |
| Sentetik/insan-yazımı/open-licensed short summary | 600 karakter | Internal dataset ömrü; revocation halinde sil |
| Genre/tag/keyword adı | 80 karakter/öğe; 32 genre, 64 tag, 64 keyword | Manifest sürümü boyunca; source policy'ye bağlı |
| Annotation evidence note | 280 karakter; en çok 4 | Annotation sürümü boyunca; public export'ta pseudonymous |
| Transformation note | 500 karakter; en çok 16 | Provenance ile birlikte |
| Provider runtime reference | Exact provider ID + bounded factual field adları | En çok 90 gün; provider metni kopyalanmaz |
| Raw provider response, synopsis/description/plot, görsel | 0 | Yasak |

## Yasak ve izinli biçimler

Dataset'te yasak: kişisel not, e-posta, UUID/profile, private library snapshot, rating/favorite/progress/feedback, raw prompt/history, API secret, raw payload dump, poster/banner/image, provider kataloğu mirror'ı ve uzun synopsis/description/plot.

İzinli olabilecek biçimler: exact provider identity, media type, bounded factual metadata, sentetik veya bağımsız insan-yazımı kısa özet, açık lisans kanıtlı kısa metin, bounded genre/tag adı, annotation label/gerekçe ve tam provenance. `provider_runtime_reference` provider metninin dataset'e kopyalandığı anlamına gelmez.

## Açık sorular ve D7-1 blocker'ları

1. TMDB'den D7 ML/validation kullanımı isteniyorsa yazılı agreement gerekir; o zamana kadar blokludur.
2. AniList tracker/competing-service ve olası public release kullanımı D8 provider compliance review'üne taşınır; D7 corpus yapılmaz.
3. TVMaze CC BY-SA'nın model weights/derived annotation dataset üzerindeki ShareAlike sonucu netleştirilmeden training yoktur.
4. Open Library description/subject için upstream field provenance bilinmeden training yoktur; facts/text ayrımı korunur.
5. OMDb için ML/derived dataset izni resmî terms'ten çıkarılamaz; yazılı izin olmadan corpus yoktur.
6. D7-1 başlamadan annotator agreement, revocation/deletion akışı ve ikinci annotator erişimi belirlenmelidir.

İlgili sözleşmeler: [Dataset Provenance](D7_DATASET_PROVENANCE.md), [Annotation Guidelines](D7_ANNOTATION_GUIDELINES.md), [Model Experiment Plan](D7_MODEL_EXPERIMENT_PLAN.md), [ML Migration Plan](D7_ML_MIGRATION_PLAN.md).
