# D7 Aspect Annotation Guidelines v1

> **D7-R0 durum notu (8 Ağustos 2026):** Bu belge archived calibration/evaluation tooling içindir; aktif D7 release yolu değildir. Mevcut private workspaces ve annotation artifact'ları korunur. Yeni annotation yapılması beklenmez. Aktif yol: [D7 Grounded Research Architecture](D7_GROUNDED_RESEARCH_ARCHITECTURE.md).

> D7-1A tool bu guideline versionını workspace metadata ve her annotation üzerinde saklar. UI label'ları Türkçeleştirir; raw enum ve annotation confidence anlamı değişmez. Evidence/contradiction note 280 karakterdir. Kısayol ve adjudication akışı için [D7 Annotation Workflow](D7_ANNOTATION_WORKFLOW.md) kullanılır.

Bu rehber candidate + aspect için anlatı merkeziliğini etiketler. Recommendation uygunluğu, kişisel zevk, kalite, popülerlik veya provider güveni etiketlenmez. Örneklerin tamamı sentetiktir; gerçek eser alıntısı kullanılmaz.

## Annotation girdisi ve güvenlik

Annotator yalnız exact identity, media type, en çok 600 karakterlik sentetik/insan-yazımı/açık lisanslı kısa özet ve bounded genre/tag/keyword alanlarını görür. Kişisel not, rating, favorite, progress, feedback, raw prompt, uzun provider açıklaması ve görsel gösterilmez.

Evidence note en çok 280 karakterdir. Provider metni alıntılanmaz; “Kısa özet ilişki çatışmasını merkeze koyuyor” gibi gerekçe yazılır. Annotator ID `ann_*` pseudonymous internal ID'dir. Annotation confidence, annotatorın etikete güvenidir; model confidence değildir.

## Ortak ordinal label'lar

### Absent

Aspect anlatıda anlamlı biçimde yoktur. Yalnız provider'da tag/genre bulunmaması absent kanıtı değildir. Absent için mevcut kısa içerik, aspect'in ilgili olmadığını değerlendirmeye yetecek kadar kapsamlı olmalıdır.

Sentetik örnek: “Bir ekip, arızalı araştırma istasyonunu tahliye etmeye çalışır; ilişki veya romantik çatışma anlatılmaz.” → `romance=absent` ancak özet ilişki unsurlarını değerlendirmeye yeterliyse.

### Incidental

Kısa, yan, seyrek veya atmosferik unsurdur; ana olay örgüsünü ve deneyimi belirlemez.

Sentetik örnek: “Dedektif soruşturma arasında bir kez eski partneriyle buluşur; çözüm tamamen fiziksel kanıtlara dayanır.” → `romance=incidental`.

### Significant

Tekrar eden, karakter kararlarını veya deneyimi belirgin etkileyen unsurdur; tek ana tema olmak zorunda değildir.

Sentetik örnek: “Siyasi ittifak arayışı ile iki karakterin gelişen ilişkisi sezon boyunca birbirini etkiler; darbe planı yine ayrı ana çatışmadır.” → `romance=significant`, `political_intrigue=significant`.

### Primary

Ana tema, temel çatışma veya anlatının merkezî mekanizmasıdır. Aspect çıkarılırsa eser kimliği ya da ana olay örgüsü önemli ölçüde değişir.

Sentetik örnek: “İki rakip hanenin varisleri arasındaki ilişki, bütün ittifakları ve final kararını belirler.” → `romance=primary`.

### Insufficient evidence

Mevcut annotation metni karar vermeye yetmez; annotator eseri bilmiyordur ve güvenilir kısa özet yoktur veya çelişki çözülemiyordur. Bu label `absent` değildir.

Sentetik örnek: Yalnız “Drama, okul, arkadaşlık” tag'leri var ve kısa özet yok. → `love_triangle=insufficient_evidence`, absent değil.

## Annotation akışı

1. Exact identity ve media type'ı kontrol et; title benzerliğiyle kayıt birleştirme.
2. Önce short summary'yi, sonra bounded taxonomy alanlarını oku. Tag yokluğunu negatif kanıt sayma.
3. Aspect tanımını ve aşağıdaki karşıt örnekleri uygula.
4. Label, annotation confidence ve kısa evidence note/span gir.
5. Çelişkili alan varsa contradiction note yaz; çözülemiyorsa `insufficient_evidence` kullan.
6. Aynı record/aspect için önceki annotator label'ını ilk turda görme. İkinci geçiş aynı kişinin bağımsız annotator sayılması değildir.
7. Disagreement adjudication'da iki ham annotation korunur; yalnız ayrı resolved kayıt `finalLabel` taşır.

## Priority aspect rehberi

| Aspect | Label odağı | Pozitif sınır | Sık false positive |
| --- | --- | --- | --- |
| `romance` | Romantik ilişkinin anlatıdaki ağırlığı | Karakter hedefi/çatışması ilişki tarafından tekrarlı belirleniyorsa significant/primary | Tek flört sahnesi, evli karakter varlığı, drama genre |
| `fantasy` | Doğaüstü dünya kuralı veya fantastik varlıkların merkeziliği | Dünya/çatışma fantastik kuralsız çalışmıyorsa primary; belirgin alt-olay ise significant | Sürreal görsel stil, mecaz, yalnız “fantasy” pazarlama etiketi |
| `action` | Fiziksel çatışma/takip/dövüşün deneyimdeki ağırlığı | Çözüm ve tempo düzenli aksiyon set-piece'lerine dayanıyorsa significant/primary | Tek final dövüşü, genel “adventure” etiketi |
| `comedy` | Mizahın amaç ve deneyim ağırlığı | Mizah anlatı ritmini sürekli kuruyorsa significant; ana amaç güldürmekse primary | Birkaç espri, hafif ton, komik yan karakter |
| `political_intrigue` | Güç aktörleri arasında gizli plan, ittifak, ihanet ve stratejik manevra | İttifak/entrika karar zinciri tekrarlıysa significant/primary | Yalnız seçim, savaş veya devlet kurumunun varlığı |
| `power_progression` | Karakterin ölçülebilir yetenek/statü/güç artışının yapısal ilerleme motoru olması | Düzenli basamaklar ve yeni güçlerin çatışmayı açması significant/primary | Genel character development, tek eğitim montajı, sosyal terfi |
| `love_triangle` | Üç kişi arasında romantik seçim/rekabet/gerilim | Üç yönlü dinamik tekrarlı karar ve çatışma üretiyorsa significant/primary | İki ayrı kısa crush, kıskanç arkadaş, çok kişili ekip |
| `fanservice` | Anlatı dışı çekicilik/seyirci hazza yönelik beden/poz/ima sunumu | Tekrarlı ve deneyimi belirgin etkiliyorsa significant; ana satış mekanizmasıysa primary | Romance, çıplaklığın dramatik bağlamı, yalnız yetişkin tema |
| `dark` | Karanlık anlatı tonu: umutsuzluk, ahlaki çürüme, yoğun tehdit veya ağır sonuçlar | Ton çoğu bölümde deneyimi belirliyorsa significant/primary | Koyu renk paleti, gece sahnesi, tek trajik olay |
| `slow_burn` | Bir ilişkinin bilinçli, uzun süreli ve küçük adımlarla gelişmesi | Gecikmeli yakınlaşma romantik yapının belirgin mekanizmasıysa significant/primary | Genel yavaş pacing, geç başlayan ama hızlı gelişen romance |
| `character_driven` | Olayların karakter seçimi, iç çatışma ve ilişki dönüşümünden doğması | Plot dönemeçleri dış olaydan çok karakter kararlarına bağlıysa significant/primary | Drama genre, çok karakter, yalnız backstory |
| `plot_driven` | Olay zinciri, hedef, soruşturma veya dış çatışmanın ilerleme motoru olması | Karakterler esasen gelişen olay/problem tarafından hareket ettiriliyorsa significant/primary | Karmaşık lore, çok twist, yüksek tempo tek başına |
| `revenge` | İntikam hedefinin karar ve olay örgüsü ağırlığı | Uzun süreli hedef ve ana çatışma ise primary; güçlü alt-motivasyon ise significant | Adalet arayışı, tek öfke anı, rakibi yenme isteği |
| `academy` | Okul/akademi/eğitim kurumunun yapısal mekân ve mekanizma olması | Ders, sınav, kurum hiyerarşisi ve öğrenci yaşamı olayları düzenli belirliyorsa significant/primary | Bir okul sahnesi, karakterlerin öğrenci olması ama olayların kurum dışı geçmesi |
| `horror` | Korku, dehşet ve tehdit hissi üretmenin merkeziliği | Gerilim/korku üretimi deneyimin sürekli hedefiyse significant/primary | Şiddet, karanlık görsel, mystery tek başına |
| `mystery` | Bilinmeyen soruyu/olayı çözme sürecinin yapısal ağırlığı | Bilgi açığa çıkarma ve çıkarım olay örgüsünü taşıyorsa significant/primary | İzleyicinin kısa süre bilmediği twist, genel belirsizlik |

## Zorunlu ayrımlar

### Politics vs `political_intrigue`

“Meclis yeni yasayı tartışır” politik ortamdır. “Üç fraksiyon gizli oy anlaşmaları, şantaj ve çifte ajanla çoğunluğu değiştirmeye çalışır” political intrigue'dir. Politics tag'i tek başına `political_intrigue` primary kanıtı değildir.

### `romance` vs `love_triangle`

İki karakter arasındaki merkezî ilişki `romance=primary` olabilir fakat üçüncü romantik taraf yoksa `love_triangle=absent` veya kanıt yetersizse insufficient'dır. Üç kişinin yalnız arkadaş olması triangle değildir.

### Character development vs `power_progression`

Korkusunu yenip sorumluluk alan karakter gelişmiştir; ölçülebilir güç basamakları yoksa power progression değildir. Yeni teknik/stat/ünvanların düzenli açılması ve çatışma kapasitesini değiştirmesi power progression'dır.

### School scene vs `academy`

Tek mezuniyet sahnesi incidental ortamdır. Dersler, sınavlar, kulüpler ve kurum kuralları sezon çatışmasını taşıyorsa academy significant/primary olabilir.

### Dark visuals vs `dark` narrative tone

Koyu paletli fakat iyimser komedi dark değildir. Aydınlık görselli olsa bile sürekli ahlaki kayıp ve umutsuz sonuçlar anlatan hikâye dark olabilir.

### Slow pacing vs `slow_burn`

Uzun sessiz sahneler slow pacing olabilir. Slow burn bu sözleşmede özellikle romantik/ilişkisel gelişimin küçük adımlarla uzun süre ertelenmesidir; genel pacing etiketi değildir.

### Drama genre vs `character_driven`

Drama label tek başına character-driven değildir. Dış krizler karakterleri pasifçe sürüklüyorsa plot-driven olabilir. Olay dönemeçleri iç seçim ve ilişki dönüşümünden doğuyorsa character-driven'dır.

### Plot complexity vs `plot_driven`

Karmaşık lore veya zaman çizgisi plot-driven garantisi değildir. Plot-driven, anlatı hareketinin dış hedef/soruşturma/olay zincirinden gelmesidir. Basit ama kesintisiz görev zinciri plot-driven olabilir.

## Class balance ve hard-negative notları

- Her aspect için positive (`significant|primary`), negative (`absent`) ve uncertain (`insufficient_evidence`) örnekleri planlı örneklenir.
- Incidental örnekler ordinal sınır için özellikle korunur.
- Hard negative, yüzey tag'i yakın olup merkezilik taşımayan örnektir: Politics var ama entrika yok; school scene var ama academy yok; dark visuals var ama dark tone yok.
- Provider veya media type tek başına label belirlemez. Annotator label dağılımını “dengelemek” için gerçeği değiştirmez; sampling dengeyi sağlar.

## Adjudication

Minimum %15–25 kayıt/aspect çifti double annotation alır. Farklı insan annotator mümkün değilse data card açıkça `single-annotator limitation` yazar. Aynı kişinin ikinci turu quality review olabilir ama inter-annotator agreement değildir.

Adjudicator ham label'ları, evidence note'ları ve contradiction'ı görür; yeni kısa gerekçe ile `finalLabel` verir. `insufficient_evidence` anlaşmazlığı veri eksikliğine işaret eder; zorla absent/positive etikete çevrilmez.

## Assistance provenance ve input sufficiency

Annotator save öncesi assistance durumunu explicit beyan eder. Başka annotator/AI cevabını görmeden verilen karar `independent_human`; kararı etkileyebilecek öneri görüldüyse `assisted_human`dır. Alanı olmayan eski kayıt `unknown_legacy`dir. Assisted ve unknown kayıt calibration için korunabilir fakat agreement/gold hesabına girmez.

Aspect için en az 3 annotation ve `insufficient_evidence >= %50` ise sorun annotator performansı diye yorumlanmaz. Input strategy, annotation reference, short-summary design ve runtime model input availability yeniden incelenir; aspect bir sonraki gold-like pilot kapsamına otomatik taşınmaz. Calibration mini-pilot aggregate sonucu [D7-1B raporunda](D7_1B_CALIBRATION_PILOT_REPORT.md) tutulur.
