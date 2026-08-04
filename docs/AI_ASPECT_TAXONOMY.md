# AI Aspect Taxonomy

> Durum: D6-0 taxonomy kaynağı; 43 kayıt D6 boyunca donduruldu. D6 kabulü [AI_RECOMMENDATION_V2_ACCEPTANCE.md](AI_RECOMMENDATION_V2_ACCEPTANCE.md), D7 etiketleme semantiği [AI_RECOMMENDATION_EVALUATION_CONTRACT.md](AI_RECOMMENDATION_EVALUATION_CONTRACT.md) içindedir.

## Amaç ve kapsam

Recommendation V2, kullanıcı isteğini yalnız genre anahtar sözcükleriyle değil, merkezi ve provider kanıtına dayalı aspect kayıtlarıyla ifade eder. Registry tek doğruluk kaynağıdır; regex, synonym ve provider eşlemeleri intent, retrieval ve scorer modüllerine ayrı ayrı kopyalanmaz.

Başlangıç registry'si 5 grupta 43 aspect içerir:

| Grup | Sayı |
|---|---:|
| Çekirdek tür/anlatı | 13 |
| Tema ve anlatı | 11 |
| İlişki dinamikleri | 5 |
| Ton ve içerik | 9 |
| Anlatım deneyimi | 5 |
| **Toplam** | **43** |

## Ortak sözleşme

```ts
type AspectSupportLevel = "strong" | "partial" | "experimental" | "unsupported";
type AspectGroup = "core_narrative" | "theme_narrative" | "relationship" | "tone_content" | "experience";
type MediaType = "anime" | "manga" | "manhwa" | "manhua" | "tv" | "movie" | "book";

interface AspectRegistryEntry {
  id: string;
  group: AspectGroup;
  labelTr: string;
  descriptionTr: string;
  synonyms: { tr: string[]; en: string[] };
  supportedMediaTypes: MediaType[];
  providerMappings: Record<"anilist" | "tvmaze" | "tmdb" | "omdb" | "open_library", {
    support: AspectSupportLevel;
    fields: string[];
    values?: string[];
  }>;
  safeForMust: boolean | "conditional";
  safeForAvoid: boolean | "conditional";
  semanticVerifier: "not_required" | "recommended" | "required_for_hard_decision";
  userFacingRiskTr: string;
}
```

Örnek veri şekli:

```json
{
  "id": "romance",
  "group": "core_narrative",
  "labelTr": "Romantizm",
  "descriptionTr": "Romantik ilişkinin anlatıdaki ağırlığı.",
  "synonyms": { "tr": ["romantik", "aşk"], "en": ["romance", "romantic"] },
  "supportedMediaTypes": ["anime", "manga", "manhwa", "manhua", "tv", "movie", "book"],
  "providerMappings": {
    "anilist": { "support": "strong", "fields": ["genres", "tags.rank"], "values": ["Romance"] },
    "tvmaze": { "support": "partial", "fields": ["genres", "summary"], "values": ["Romance"] },
    "tmdb": { "support": "partial", "fields": ["genres", "keywords"], "values": ["Romance"] },
    "omdb": { "support": "partial", "fields": ["Genre", "Plot"], "values": ["Romance"] },
    "open_library": { "support": "partial", "fields": ["subjects", "description"], "values": ["Love stories"] }
  },
  "safeForMust": "conditional",
  "safeForAvoid": "conditional",
  "semanticVerifier": "recommended",
  "userFacingRiskTr": "Genre etiketi romantizmin merkeziliğini tek başına kanıtlamaz."
}
```

Kısaltmalar: `AL` AniList, `TV` TVMaze, `TM` TMDB, `OM` OMDb, `OL` Open Library; `S` strong, `P` partial, `E` experimental, `U` unsupported. `Tümü`, sözleşmedeki yedi MediaType'ın tamamıdır. `Doğu`, anime/manga/manhwa/manhua; `Ekran`, anime/tv/movie; `Yazılı`, manga/manhwa/manhua/book anlamına gelir. Bu kısaltmalar yalnız aşağıdaki okunabilirlik içindir; gerçek registry açık MediaType dizileri taşır.

`Koşullu` güvenlik, hard karar için medium/high confidence çoklu yapılandırılmış kanıt ya da uygun verifier kanıtı gerektiğini belirtir. Provider synopsis'i tek başına strong değildir.

## Başlangıç registry'si

### Çekirdek tür/anlatı

| ID | Türkçe etiket ve açıklama | Synonym'ler (TR / EN) | MediaType | Provider eşlemesi | Must / avoid | Verifier | Kullanıcı riski/notu |
|---|---|---|---|---|---|---|---|
| `romance` | Romantizm — romantik ilişkinin anlatı ağırlığı | romantik, aşk / romance, romantic | Tümü | AL:S genre+tag rank; TV:P genre; TM:P genre+keyword; OM:P genre; OL:P subject | Koşullu / Koşullu | Önerilir | Genre, merkeziliği tek başına göstermez. |
| `action` | Aksiyon — çatışma ve hareket odaklı anlatı | aksiyon, dövüş / action, combat | Tümü | AL:S genre+tag; TV:P genre; TM:S genre+keyword; OM:P genre; OL:P subject | Koşullu / Koşullu | Önerilir | Kısa aksiyon sahneleri primary anlamına gelmez. |
| `adventure` | Macera — keşif ve yolculuk odağı | macera, keşif / adventure, quest | Tümü | AL:S genre+tag; TV:P genre; TM:S genre+keyword; OM:P genre; OL:P subject | Koşullu / Koşullu | Önerilir | Genre kapsayıcı olabilir. |
| `comedy` | Komedi — mizahın anlatıdaki ağırlığı | komedi, mizah / comedy, humorous | Tümü | AL:S genre+tag; TV:P genre; TM:S genre; OM:P genre; OL:P subject | Koşullu / Koşullu | Önerilir | Ton yoğunluğu provider'a göre değişir. |
| `drama` | Dram — ciddi kişilerarası veya duygusal çatışma | dram, dramatik / drama, dramatic | Tümü | AL:S genre+tag; TV:P genre; TM:S genre; OM:P genre; OL:P subject | Koşullu / Koşullu | Önerilir | Fazla geniş bir etikettir. |
| `mystery` | Gizem — bilinmeyeni çözme odağı | gizem, muamma / mystery, whodunit | Tümü | AL:S genre+tag; TV:P genre; TM:S genre+keyword; OM:P genre; OL:P subject | Koşullu / Koşullu | Önerilir | Thriller ile karışabilir. |
| `horror` | Korku — korkutma ve dehşet odağı | korku, ürkütücü / horror, scary | Tümü | AL:S genre+tag; TV:P genre; TM:S genre+keyword; OM:P genre; OL:P subject | Koşullu / Koşullu | Önerilir | İçerik şiddeti ayrıca değerlendirilir. |
| `fantasy` | Fantastik — doğaüstü dünya veya büyü düzeni | fantastik, büyülü / fantasy, magical | Tümü | AL:S genre+tag; TV:P genre; TM:S genre+keyword; OM:P genre; OL:S subject | Evet / Koşullu | Gerekmez | Urban fantasy ile yüksek fantastik ayrılmaz. |
| `sci_fi` | Bilim kurgu — bilim/teknoloji varsayımı odağı | bilim kurgu, uzay / sci-fi, science fiction | Tümü | AL:S genre+tag; TV:P genre; TM:S genre+keyword; OM:P genre; OL:S subject | Evet / Koşullu | Gerekmez | Space fantasy ile sınır bulanık olabilir. |
| `slice_of_life` | Gündelik yaşam — günlük deneyim ve düşük ölçekli anlatı | gündelik yaşam, hayatın içinden / slice of life, everyday life | Tümü | AL:S genre+tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Ekran provider'larında güvenilir taxonomy yoktur. |
| `supernatural` | Doğaüstü — doğa yasaları dışındaki unsurlar | doğaüstü, paranormal / supernatural, paranormal | Tümü | AL:S genre+tag; TV:P genre; TM:P genre+keyword; OM:P genre; OL:P subject | Koşullu / Koşullu | Önerilir | Fantasy ile örtüşebilir. |
| `psychological` | Psikolojik — zihinsel süreç ve algı odağı | psikolojik, zihin oyunu / psychological, mind game | Tümü | AL:S genre+tag rank; TV:E summary; TM:P keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Pazarlama dili yanlış pozitif üretebilir. |
| `historical` | Tarihsel — belirli tarihsel dönem/olay odağı | tarihî, dönem / historical, period | Tümü | AL:S genre+tag; TV:P genre+summary; TM:S genre+keyword; OM:P genre; OL:S subject | Evet / Koşullu | Önerilir | Tarih esintili fantasy gerçek tarih değildir. |

### Tema ve anlatı

| ID | Türkçe etiket ve açıklama | Synonym'ler (TR / EN) | MediaType | Provider eşlemesi | Must / avoid | Verifier | Kullanıcı riski/notu |
|---|---|---|---|---|---|---|---|
| `political_intrigue` | Politik entrika — iktidar pazarlığı ve kurum çatışması | siyasi entrika, saray oyunu / political intrigue, court politics | Tümü | AL:S tag rank; TV:E summary; TM:P keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Genel “politics” etiketi entrika yoğunluğunu kanıtlamaz. |
| `power_progression` | Güç gelişimi — ölçülebilir yetenek/güç yükselişi | güçlenme, seviye atlama / power progression, power growth | Doğu,Yazılı | AL:S tag rank; TV:U; TM:E keyword; OM:U; OL:E subject | Koşullu / Koşullu | Hard karar için gerekli | Standart karakter gelişimiyle karışabilir. |
| `revenge` | İntikam — misillemenin ana motivasyon olması | intikam, öç / revenge, vengeance | Tümü | AL:S tag rank; TV:E summary; TM:P keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Tek bir alt olay primary tema değildir. |
| `survival` | Hayatta kalma — yaşamı sürdürmenin ana çatışma olması | hayatta kalma, yaşam mücadelesi / survival, survive | Tümü | AL:S tag rank; TV:P genre+summary; TM:P keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Önerilir | Thriller ile örtüşebilir. |
| `found_family` | Seçilmiş aile — akraba olmayanların aile bağı kurması | seçilmiş aile, ekip ailesi / found family, chosen family | Tümü | AL:S tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:E subject | Koşullu / Koşullu | Hard karar için gerekli | Takım arkadaşlığı tek başına yeterli değildir. |
| `coming_of_age` | Büyüme hikâyesi — olgunlaşma ve kimlik gelişimi | büyüme hikâyesi, yetişkinliğe geçiş / coming of age, growing up | Tümü | AL:S tag rank; TV:P genre+summary; TM:P genre+keyword; OM:P genre; OL:S subject | Koşullu / Koşullu | Önerilir | Genç karakter bulunması yeterli değildir. |
| `academy` | Akademi/okul — kurum içi eğitim ve öğrenci yaşamı odağı | okul, akademi / academy, school setting | Tümü | AL:S tag rank; TV:E summary; TM:P keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Kısa okul sahneleri incidental olabilir. |
| `time_travel` | Zaman yolculuğu — zamanda hareketin yapısal rolü | zaman yolculuğu, zaman döngüsü / time travel, time loop | Tümü | AL:S tag rank; TV:E summary; TM:S keyword; OM:E plot; OL:S subject | Koşullu / Koşullu | Önerilir | Flashback zaman yolculuğu değildir. |
| `game_system` | Oyun sistemi — seviye/stat/görev mekaniğinin gerçek dünya kuralı olması | oyun sistemi, stat ekranı / game system, leveling system | Doğu,Yazılı | AL:S tag rank; TV:U; TM:E keyword; OM:U; OL:E subject | Koşullu / Koşullu | Hard karar için gerekli | Oyun uyarlaması olmak sistem anlatısı demek değildir. |
| `isekai` | Başka dünyaya geçiş — karakterin farklı dünyaya taşınması | isekai, başka dünya / isekai, another world | Doğu,Yazılı | AL:S tag rank; TV:U; TM:E keyword; OM:U; OL:E subject | Evet / Koşullu | Önerilir | Portal fantasy ile taxonomy sınırı belirtilmelidir. |
| `antihero` | Anti-kahraman — ahlaken gri baş karakter odağı | anti kahraman, gri protagonist / antihero, morally grey protagonist | Tümü | AL:S tag rank; TV:E summary; TM:P keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Kötücül yan karakter yeterli değildir. |

### İlişki dinamikleri

| ID | Türkçe etiket ve açıklama | Synonym'ler (TR / EN) | MediaType | Provider eşlemesi | Must / avoid | Verifier | Kullanıcı riski/notu |
|---|---|---|---|---|---|---|---|
| `love_triangle` | Aşk üçgeni — üç kişi arasında anlamlı romantik rekabet | aşk üçgeni / love triangle, romantic triangle | Tümü | AL:S tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Synopsis ilişki yapısını saklayabilir. |
| `slow_burn` | Yavaş gelişen ilişki — bağın uzun sürede kurulması | yavaş romantizm, ağır gelişen ilişki / slow burn, gradual romance | Tümü | AL:P tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:E subject | Hayır / Koşullu | Hard karar için gerekli | Süreç bilgisi kısa metadata'dan güvenle çıkarılamaz. |
| `enemies_to_lovers` | Düşmandan sevgiliye — çatışmalı ilişkinin romantizme dönüşmesi | düşmandan sevgiliye / enemies to lovers, rivals to lovers | Tümü | AL:S tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | “Rivals” her zaman düşmanlık değildir. |
| `friendship_focus` | Arkadaşlık odağı — arkadaşlık bağının merkezde olması | dostluk, arkadaşlık / friendship focus, friendship | Tümü | AL:P tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Ekip varlığı merkezilik kanıtı değildir. |
| `family_focus` | Aile odağı — aile ilişkilerinin merkezde olması | aile ilişkileri, aile draması / family focus, family relationships | Tümü | AL:P tag rank; TV:P genre+summary; TM:P keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Önerilir | Family genre, aile odağıyla aynı değildir. |

### Ton ve içerik

| ID | Türkçe etiket ve açıklama | Synonym'ler (TR / EN) | MediaType | Provider eşlemesi | Must / avoid | Verifier | Kullanıcı riski/notu |
|---|---|---|---|---|---|---|---|
| `dark` | Karanlık ton — kasvetli ve ağır anlatım | karanlık, kasvetli / dark, bleak | Tümü | AL:P tag rank; TV:E summary; TM:P keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Horror veya şiddet otomatik olarak karanlık ton değildir. |
| `cozy` | Sıcak/rahat ton — düşük stresli güvenli his | huzurlu, sıcacık / cozy, comforting | Tümü | AL:P tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:P subject | Hayır / Koşullu | Hard karar için gerekli | Provider taxonomy desteği zayıftır. |
| `emotional` | Duygusal yoğunluk — güçlü duygusal etki odağı | duygusal, dokunaklı / emotional, moving | Tümü | AL:P tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:E subject | Hayır / Koşullu | Hard karar için gerekli | Öznel ve kullanıcıya göre değişkendir. |
| `tragic` | Trajik ton/sonuç — ağır kayıp ve trajedi odağı | trajik, acıklı / tragic, tragedy | Tümü | AL:P tag rank; TV:E summary; TM:P keyword; OM:P genre; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Spoiler riski vardır; açıklama ayrıntı vermemelidir. |
| `hopeful` | Umutlu ton — iyileşme ve olumlu gelecek vurgusu | umutlu, iyimser / hopeful, uplifting | Tümü | AL:E tag; TV:E summary; TM:E keyword; OM:E plot; OL:E subject | Hayır / Koşullu | Hard karar için gerekli | Son bilgisini kullanmak spoiler yaratabilir. |
| `violence_gore` | Şiddet/kan — grafik veya yoğun fiziksel şiddet | kanlı, vahşet, yoğun şiddet / gore, graphic violence | Tümü | AL:S tag rank; TV:E summary; TM:P keyword+certification; OM:P rating+plot; OL:P subject | Koşullu / Koşullu | Önerilir | Yaş derecesi şiddetin türünü tek başına göstermez. |
| `fanservice` | Fanservice — cinselleştirilmiş/seyirciye dönük görsel vurgu | fanservis, ecchi / fanservice, ecchi | Doğu | AL:S tag rank; TV:U; TM:E keyword; OM:U; OL:U | Koşullu / Koşullu | Önerilir | Tag rank yoksa yoğunluk bilinmez. |
| `sexual_content` | Cinsel içerik — açık veya güçlü cinsel içerik | cinsellik, yetişkin içerik / sexual content, explicit sexual content | Tümü | AL:P tag rank; TV:E summary; TM:P keyword+certification; OM:P rating+plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Rating, içerik türünü tam açıklamaz. |
| `disturbing_content` | Rahatsız edici içerik — ağır psikolojik/etik tetikleyiciler | rahatsız edici, tetikleyici / disturbing, unsettling content | Tümü | AL:P tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:E subject | Hayır / Koşullu | Hard karar için gerekli | Eksik metadata nedeniyle absent denmemelidir. |

### Anlatım deneyimi

| ID | Türkçe etiket ve açıklama | Synonym'ler (TR / EN) | MediaType | Provider eşlemesi | Must / avoid | Verifier | Kullanıcı riski/notu |
|---|---|---|---|---|---|---|---|
| `slow_paced` | Yavaş tempolu — olayların bilinçli yavaş ilerlemesi | yavaş tempolu, ağır ilerleyen / slow paced, leisurely paced | Tümü | AL:P tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:E description | Hayır / Koşullu | Hard karar için gerekli | Uzun eser otomatik yavaş değildir. |
| `fast_paced` | Hızlı tempolu — yoğun ve hızlı olay ilerleyişi | hızlı tempolu, sürükleyici / fast paced, rapid paced | Tümü | AL:P tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:E description | Hayır / Koşullu | Hard karar için gerekli | Kısa eser otomatik hızlı değildir. |
| `character_driven` | Karakter odaklı — ilerleyişi karakter kararları taşır | karakter odaklı / character driven, character study | Tümü | AL:P tag rank; TV:E summary; TM:E keyword; OM:E plot; OL:P subject | Koşullu / Koşullu | Hard karar için gerekli | Drama genre tek başına yeterli değildir. |
| `plot_driven` | Olay örgüsü odaklı — ilerleyişi dış olaylar taşır | olay odaklı / plot driven, story driven | Tümü | AL:E tag; TV:E summary; TM:E keyword; OM:E plot; OL:E description | Hayır / Koşullu | Hard karar için gerekli | Character-driven ile aynı anda bulunabilir. |
| `episodic` | Bölümsel yapı — bölümlerin büyük ölçüde bağımsız olması | epizodik, bölüm bölüm / episodic, case of the week | Ekran,Yazılı | AL:P tag rank; TV:P episode metadata+summary; TM:E keyword; OM:E plot; OL:E subject | Koşullu / Koşullu | Hard karar için gerekli | Episode metadata yapı biçimini kanıtlamaz. |

## Provider mapping ve hard karar kuralları

- `strong`, alanın var olmasını değil provider alanı ile aspect arasında kararlı ve açık bir taxonomy eşleşmesini ifade eder. AniList tag'i için rank/relevance korunmadan strong sonuç üretilemez.
- `partial`, soft sinyal veya başka kanıtlarla birleşen medium confidence kaynağıdır.
- `experimental`, tek başına hard filtre uygulayamaz; yalnız verifier girdisi veya açıklanmış risk sinyali olabilir.
- `unsupported`, `absent` değildir. Sonuç `unknown` kalır.
- `safeForMust: true` bile veri yokluğunda eşleşme üretmez. Explicit must için strictness sözleşmesi uygulanır.
- Avoid güvenliği, yanlış pozitifin kullanıcıya iyi adayı kaybettirme riskini içerir. Düşük güvenli avoid, balanced modda risk etiketi olabilir.
- Synonym'ler intent eşlemesi içindir; aday metadata'sına regex uygulayarak doğrudan aspect doğrulaması yapmak için değildir.

## Sonuç seviyeleri

Registry değerlendirmesi [AI Recommendation V2 Architecture](AI_RECOMMENDATION_V2_ARCHITECTURE.md) içindeki `AspectEvidence` sözleşmesini üretir:

- `primary`: strength `0.75–1.00`
- `significant`: strength `0.50–0.749…`
- `incidental`: strength `0.20–0.499…`
- `absent`: strength `0–0.199…`, yalnız desteklenen alanlardan yeterli negatif kanıt varsa
- `unknown`: destek yoksa, veri eksikse veya çelişki karar vermeyi engelliyorsa

Eşikler D6 sözleşme başlangıcıdır; D7 gold-label ölçümü olmadan provider veya MediaType bazında sessizce ayarlanmaz.

## D6-1 kod karşılığı

D6-3 kod karşılığı: registry alias'ları [`constraint-extractor.ts`](../features/recommendations/intent/constraint-extractor.ts) ve provider raw claim mapping/aggregation tarafından tek aspect doğruluk kaynağı olarak tüketilir. Ayrıntılı katkı, confidence ve unknown semantiği [V2 Ranking](AI_RECOMMENDATION_V2_RANKING.md) belgesindedir. V1 regex'leri compatibility kodunda bulunabilir fakat V2 final eligibility için kanıt değildir.

Registry [`features/recommendations/domain/aspect-registry.ts`](../features/recommendations/domain/aspect-registry.ts), merkezi eşikler [`aspect-strength.ts`](../features/recommendations/domain/aspect-strength.ts), runtime invariant'lar [`codec.ts`](../features/recommendations/domain/codec.ts) içindedir. Kod 43 kaydı ve beş explicit provider mapping'ini taşır; D6-3 V2 constraint/evidence/ranking yolu registry'yi kullanır. Legacy V1 regex'leri yalnız compatibility/migration karşılaştırmasıdır. Ayrıntı için [AI Recommendation V2 Domain](AI_RECOMMENDATION_V2_DOMAIN.md) belgesine bakın.
