import type {
  AspectGroup,
  AspectEvidenceStrategy,
  AspectSupportLevel,
  ConstraintSafety,
  RecommendationMediaType,
  RecommendationProvider,
  SemanticVerifierRequirement,
} from "./types";

export interface AspectRegistryEntry {
  id: string;
  group: AspectGroup;
  labelTr: string;
  labelEn: string;
  descriptionTr: string;
  aliasesTr: readonly string[];
  aliasesEn: readonly string[];
  supportedMediaTypes: readonly RecommendationMediaType[];
  providerSupport: Readonly<Record<RecommendationProvider, AspectSupportLevel>>;
  defaultEvidenceStrategy: AspectEvidenceStrategy;
  providerStrategyOverrides?: Readonly<Partial<Record<RecommendationProvider, AspectEvidenceStrategy>>>;
  mustSafety: ConstraintSafety;
  avoidSafety: ConstraintSafety;
  semanticVerifier: SemanticVerifierRequirement;
  limitationNoteTr?: string;
}

const ALL = ["anime", "manga", "manhwa", "manhua", "tv", "movie", "book"] as const;
const EAST = ["anime", "manga", "manhwa", "manhua"] as const;
const SCREEN = ["anime", "tv", "movie"] as const;

export const ASPECT_REGISTRY = {
  romance: {
    id: "romance", group: "core", labelTr: "Romantizm", labelEn: "Romance",
    descriptionTr: "Romantik ilişkinin anlatıdaki ağırlığı.", aliasesTr: ["romantik", "aşk"], aliasesEn: ["romantic", "love story"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "partial", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Genre etiketi merkeziliği tek başına kanıtlamaz.",
  },
  action: {
    id: "action", group: "core", labelTr: "Aksiyon", labelEn: "Action",
    descriptionTr: "Çatışma ve hareket odaklı anlatı.", aliasesTr: ["dövüş", "hareketli"], aliasesEn: ["combat", "fight scenes"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "strong", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Kısa aksiyon sahneleri primary anlamına gelmez.",
  },
  adventure: {
    id: "adventure", group: "core", labelTr: "Macera", labelEn: "Adventure",
    descriptionTr: "Keşif, yolculuk veya görev odağı.", aliasesTr: ["keşif", "serüven"], aliasesEn: ["quest", "exploration"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "strong", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Genre kapsayıcı olabilir.",
  },
  comedy: {
    id: "comedy", group: "core", labelTr: "Komedi", labelEn: "Comedy",
    descriptionTr: "Mizahın anlatıdaki ağırlığı.", aliasesTr: ["mizah", "komik"], aliasesEn: ["humor", "funny"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "strong", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Komedi yoğunluğu provider'a göre değişebilir.",
  },
  drama: {
    id: "drama", group: "core", labelTr: "Dram", labelEn: "Drama",
    descriptionTr: "Ciddi kişilerarası veya duygusal çatışma.", aliasesTr: ["dramatik", "ağır dram"], aliasesEn: ["dramatic", "serious drama"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "strong", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Geniş bir provider etiketidir.",
  },
  mystery: {
    id: "mystery", group: "core", labelTr: "Gizem", labelEn: "Mystery",
    descriptionTr: "Bilinmeyeni çözme odağı.", aliasesTr: ["muamma", "dedektiflik"], aliasesEn: ["whodunit", "detective mystery"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "strong", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Thriller ile örtüşebilir.",
  },
  horror: {
    id: "horror", group: "core", labelTr: "Korku", labelEn: "Horror",
    descriptionTr: "Korkutma ve dehşet odağı.", aliasesTr: ["ürkütücü", "dehşet"], aliasesEn: ["scary", "terror"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "strong", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Şiddet yoğunluğu ayrıca değerlendirilir.",
  },
  fantasy: {
    id: "fantasy", group: "core", labelTr: "Fantastik", labelEn: "Fantasy",
    descriptionTr: "Büyü veya doğaüstü dünya düzeni.", aliasesTr: ["büyülü", "fantazi"], aliasesEn: ["magical fantasy", "high fantasy"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "strong", omdb: "partial", openlibrary: "strong" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "safe", avoidSafety: "conditional", semanticVerifier: "not_required", limitationNoteTr: "Alt fantasy türleri tek başına ayrılmaz.",
  },
  sci_fi: {
    id: "sci_fi", group: "core", labelTr: "Bilim kurgu", labelEn: "Science Fiction",
    descriptionTr: "Bilim veya teknoloji varsayımı odağı.", aliasesTr: ["bilimkurgu", "uzay kurgusu"], aliasesEn: ["sci fi", "science-fiction"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "strong", omdb: "partial", openlibrary: "strong" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "safe", avoidSafety: "conditional", semanticVerifier: "not_required", limitationNoteTr: "Space fantasy ile sınır bulanık olabilir.",
  },
  slice_of_life: {
    id: "slice_of_life", group: "core", labelTr: "Gündelik yaşam", labelEn: "Slice of Life",
    descriptionTr: "Günlük deneyim ve düşük ölçekli anlatı.", aliasesTr: ["hayatın içinden", "gündelik hayat"], aliasesEn: ["everyday life", "daily life"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Ekran provider'larında güvenilir taxonomy zayıftır.",
  },
  supernatural: {
    id: "supernatural", group: "core", labelTr: "Doğaüstü", labelEn: "Supernatural",
    descriptionTr: "Doğa yasaları dışındaki unsurlar.", aliasesTr: ["paranormal", "doğa dışı"], aliasesEn: ["paranormal phenomena", "occult"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "partial", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Fantasy ile örtüşebilir.",
  },
  psychological: {
    id: "psychological", group: "core", labelTr: "Psikolojik", labelEn: "Psychological",
    descriptionTr: "Zihinsel süreç, algı ve iç çatışma odağı.", aliasesTr: ["zihin oyunu", "psikolojik gerilim"], aliasesEn: ["mind game", "psychological thriller"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "partial", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Pazarlama dili yanlış pozitif üretebilir.",
  },
  historical: {
    id: "historical", group: "core", labelTr: "Tarihsel", labelEn: "Historical",
    descriptionTr: "Belirli tarihsel dönem veya olay odağı.", aliasesTr: ["tarihî", "dönem eseri"], aliasesEn: ["period piece", "historic setting"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "strong", omdb: "partial", openlibrary: "strong" },
    defaultEvidenceStrategy: "exact_taxonomy", providerStrategyOverrides: { openlibrary: "soft_only" },
    mustSafety: "safe", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Tarih esintili fantasy gerçek tarih değildir.",
  },
  political_intrigue: {
    id: "political_intrigue", group: "narrative", labelTr: "Politik entrika", labelEn: "Political Intrigue",
    descriptionTr: "İktidar pazarlığı ve kurum çatışması.", aliasesTr: ["siyasi entrika", "saray oyunu"], aliasesEn: ["court politics", "power politics"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "partial", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Genel politika etiketi entrika yoğunluğunu kanıtlamaz.",
  },
  power_progression: {
    id: "power_progression", group: "narrative", labelTr: "Güç gelişimi", labelEn: "Power Progression",
    descriptionTr: "Ölçülebilir yetenek veya güç yükselişi.", aliasesTr: ["güçlenme", "seviye atlama"], aliasesEn: ["power growth", "progression fantasy"], supportedMediaTypes: EAST,
    providerSupport: { anilist: "strong", tvmaze: "unsupported", tmdb: "experimental", omdb: "unsupported", openlibrary: "experimental" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Standart karakter gelişimiyle karışabilir.",
  },
  revenge: {
    id: "revenge", group: "narrative", labelTr: "İntikam", labelEn: "Revenge",
    descriptionTr: "Misillemenin ana motivasyon olması.", aliasesTr: ["öç", "intikam hikâyesi"], aliasesEn: ["vengeance", "revenge story"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "partial", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Tek alt olay primary tema değildir.",
  },
  survival: {
    id: "survival", group: "narrative", labelTr: "Hayatta kalma", labelEn: "Survival",
    descriptionTr: "Yaşamı sürdürmenin ana çatışma olması.", aliasesTr: ["yaşam mücadelesi", "hayatta kalış"], aliasesEn: ["survive", "survival story"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "partial", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Thriller ile örtüşebilir.",
  },
  found_family: {
    id: "found_family", group: "narrative", labelTr: "Seçilmiş aile", labelEn: "Found Family",
    descriptionTr: "Akraba olmayanların aile bağı kurması.", aliasesTr: ["bulunmuş aile", "ekip ailesi"], aliasesEn: ["chosen family", "makeshift family"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "experimental" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Takım arkadaşlığı tek başına yeterli değildir.",
  },
  coming_of_age: {
    id: "coming_of_age", group: "narrative", labelTr: "Büyüme hikâyesi", labelEn: "Coming of Age",
    descriptionTr: "Olgunlaşma ve kimlik gelişimi.", aliasesTr: ["yetişkinliğe geçiş", "olgunlaşma"], aliasesEn: ["growing up", "rite of passage"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "partial", tmdb: "partial", omdb: "partial", openlibrary: "strong" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Genç karakter bulunması yeterli değildir.",
  },
  academy: {
    id: "academy", group: "narrative", labelTr: "Akademi/okul", labelEn: "Academy",
    descriptionTr: "Kurum içi eğitim ve öğrenci yaşamı odağı.", aliasesTr: ["okul ortamı", "akademi hayatı"], aliasesEn: ["school setting", "academy setting"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "partial", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Kısa okul sahneleri incidental olabilir.",
  },
  time_travel: {
    id: "time_travel", group: "narrative", labelTr: "Zaman yolculuğu", labelEn: "Time Travel",
    descriptionTr: "Zamanda hareketin yapısal rolü.", aliasesTr: ["zaman döngüsü", "zamanda yolculuk"], aliasesEn: ["time loop", "temporal travel"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "strong", omdb: "experimental", openlibrary: "strong" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Flashback zaman yolculuğu değildir.",
  },
  game_system: {
    id: "game_system", group: "narrative", labelTr: "Oyun sistemi", labelEn: "Game System",
    descriptionTr: "Seviye, stat veya görev mekaniğinin dünya kuralı olması.", aliasesTr: ["stat ekranı", "oyun mekaniği"], aliasesEn: ["leveling system", "game mechanics world"], supportedMediaTypes: EAST,
    providerSupport: { anilist: "strong", tvmaze: "unsupported", tmdb: "experimental", omdb: "unsupported", openlibrary: "experimental" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Oyun uyarlaması olmak sistem anlatısı değildir.",
  },
  isekai: {
    id: "isekai", group: "narrative", labelTr: "Başka dünyaya geçiş", labelEn: "Isekai",
    descriptionTr: "Karakterin farklı bir dünyaya taşınması.", aliasesTr: ["başka dünya", "öte dünyaya geçiş"], aliasesEn: ["another world", "transported to another world"], supportedMediaTypes: EAST,
    providerSupport: { anilist: "strong", tvmaze: "unsupported", tmdb: "experimental", omdb: "unsupported", openlibrary: "experimental" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "safe", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Portal fantasy sınırı açıklanmalıdır.",
  },
  antihero: {
    id: "antihero", group: "narrative", labelTr: "Anti-kahraman", labelEn: "Antihero",
    descriptionTr: "Ahlaken gri baş karakter odağı.", aliasesTr: ["gri protagonist", "ahlaken gri kahraman"], aliasesEn: ["morally grey protagonist", "anti hero"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "partial", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Kötücül yan karakter yeterli değildir.",
  },
  love_triangle: {
    id: "love_triangle", group: "relationship", labelTr: "Aşk üçgeni", labelEn: "Love Triangle",
    descriptionTr: "Üç kişi arasında anlamlı romantik rekabet.", aliasesTr: ["aşk üçgen", "romantik üçgen", "üçlü aşk"], aliasesEn: ["romantic triangle", "triangle romance"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Synopsis ilişki yapısını saklayabilir.",
  },
  slow_burn: {
    id: "slow_burn", group: "relationship", labelTr: "Yavaş gelişen ilişki", labelEn: "Slow Burn",
    descriptionTr: "İlişkinin uzun sürede kurulması.", aliasesTr: ["yavaş romantizm", "ağır gelişen ilişki"], aliasesEn: ["gradual romance", "slow romance"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "experimental" },
    defaultEvidenceStrategy: "semantic_required",
    mustSafety: "unsafe", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Süreç bilgisi kısa metadata'dan güvenle çıkarılamaz.",
  },
  enemies_to_lovers: {
    id: "enemies_to_lovers", group: "relationship", labelTr: "Düşmandan sevgiliye", labelEn: "Enemies to Lovers",
    descriptionTr: "Çatışmalı ilişkinin romantizme dönüşmesi.", aliasesTr: ["rakipten sevgiliye", "düşman aşklar"], aliasesEn: ["rivals to lovers", "foes to lovers"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Rakiplik her zaman düşmanlık değildir.",
  },
  friendship_focus: {
    id: "friendship_focus", group: "relationship", labelTr: "Arkadaşlık odağı", labelEn: "Friendship Focus",
    descriptionTr: "Arkadaşlık bağının anlatının merkezinde olması.", aliasesTr: ["dostluk odağı", "arkadaşlık teması"], aliasesEn: ["friendship theme", "friendship centered"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Ekip varlığı merkezilik kanıtı değildir.",
  },
  family_focus: {
    id: "family_focus", group: "relationship", labelTr: "Aile odağı", labelEn: "Family Focus",
    descriptionTr: "Aile ilişkilerinin anlatının merkezinde olması.", aliasesTr: ["aile ilişkileri", "aile draması"], aliasesEn: ["family relationships", "family centered"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "partial", tmdb: "partial", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Family genre, aile odağıyla aynı değildir.",
  },
  dark: {
    id: "dark", group: "tone_content", labelTr: "Karanlık ton", labelEn: "Dark",
    descriptionTr: "Kasvetli ve ağır anlatım tonu.", aliasesTr: ["kasvetli", "karanlık atmosfer"], aliasesEn: ["bleak", "grim tone"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "partial", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Korku veya şiddet otomatik karanlık ton değildir.",
  },
  cozy: {
    id: "cozy", group: "tone_content", labelTr: "Sıcak/rahat ton", labelEn: "Cozy",
    descriptionTr: "Düşük stresli ve güvenli his veren ton.", aliasesTr: ["huzurlu", "sıcacık"], aliasesEn: ["comforting", "feel good cozy"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "semantic_required",
    mustSafety: "unsafe", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Provider taxonomy desteği zayıftır.",
  },
  emotional: {
    id: "emotional", group: "tone_content", labelTr: "Duygusal yoğunluk", labelEn: "Emotional",
    descriptionTr: "Güçlü duygusal etki odağı.", aliasesTr: ["dokunaklı", "duygu yüklü"], aliasesEn: ["moving", "emotionally intense"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "experimental" },
    defaultEvidenceStrategy: "semantic_required",
    mustSafety: "unsafe", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Öznel ve kullanıcıya göre değişkendir.",
  },
  tragic: {
    id: "tragic", group: "tone_content", labelTr: "Trajik", labelEn: "Tragic",
    descriptionTr: "Ağır kayıp ve trajedi odağı.", aliasesTr: ["acıklı", "trajedi"], aliasesEn: ["tragedy", "tragic story"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "partial", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Açıklamalar spoiler vermemelidir.",
  },
  hopeful: {
    id: "hopeful", group: "tone_content", labelTr: "Umutlu ton", labelEn: "Hopeful",
    descriptionTr: "İyileşme ve olumlu gelecek vurgusu.", aliasesTr: ["iyimser", "umut veren"], aliasesEn: ["uplifting", "optimistic tone"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "experimental", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "experimental" },
    defaultEvidenceStrategy: "semantic_required",
    mustSafety: "unsafe", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Son bilgisi spoiler yaratabilir.",
  },
  violence_gore: {
    id: "violence_gore", group: "tone_content", labelTr: "Şiddet/kan", labelEn: "Violence and Gore",
    descriptionTr: "Grafik veya yoğun fiziksel şiddet.", aliasesTr: ["kanlı", "vahşet"], aliasesEn: ["gore", "graphic violence"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "strong", tvmaze: "experimental", tmdb: "partial", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Yaş derecesi içeriğin türünü tek başına göstermez.",
  },
  fanservice: {
    id: "fanservice", group: "tone_content", labelTr: "Fanservice", labelEn: "Fanservice",
    descriptionTr: "Cinselleştirilmiş veya seyirciye dönük görsel vurgu.", aliasesTr: ["fanservis", "ecchi içerik"], aliasesEn: ["ecchi", "sexualized fan service"], supportedMediaTypes: EAST,
    providerSupport: { anilist: "strong", tvmaze: "unsupported", tmdb: "experimental", omdb: "unsupported", openlibrary: "unsupported" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "recommended", limitationNoteTr: "Tag rank olmadan yoğunluk bilinmez.",
  },
  sexual_content: {
    id: "sexual_content", group: "tone_content", labelTr: "Cinsel içerik", labelEn: "Sexual Content",
    descriptionTr: "Açık veya güçlü cinsel içerik.", aliasesTr: ["cinsellik", "yetişkin cinsel içerik"], aliasesEn: ["explicit sexual content", "sexual themes"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "partial", omdb: "partial", openlibrary: "partial" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Rating içerik türünü tam açıklamaz.",
  },
  disturbing_content: {
    id: "disturbing_content", group: "tone_content", labelTr: "Rahatsız edici içerik", labelEn: "Disturbing Content",
    descriptionTr: "Ağır psikolojik veya etik tetikleyiciler.", aliasesTr: ["tetikleyici içerik", "rahatsız edici"], aliasesEn: ["unsettling content", "disturbing themes"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "experimental" },
    defaultEvidenceStrategy: "ranked_tag", providerStrategyOverrides: { tvmaze: "soft_only", tmdb: "soft_only", omdb: "soft_only", openlibrary: "soft_only" },
    mustSafety: "unsafe", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Eksik metadata absent kanıtı değildir.",
  },
  slow_paced: {
    id: "slow_paced", group: "experience", labelTr: "Yavaş tempolu", labelEn: "Slow Paced",
    descriptionTr: "Olayların bilinçli olarak yavaş ilerlemesi.", aliasesTr: ["ağır ilerleyen", "düşük tempo"], aliasesEn: ["leisurely paced", "slow pacing"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "experimental" },
    defaultEvidenceStrategy: "semantic_required",
    mustSafety: "unsafe", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Uzun eser otomatik yavaş değildir.",
  },
  fast_paced: {
    id: "fast_paced", group: "experience", labelTr: "Hızlı tempolu", labelEn: "Fast Paced",
    descriptionTr: "Yoğun ve hızlı olay ilerleyişi.", aliasesTr: ["sürükleyici tempo", "yüksek tempo"], aliasesEn: ["rapid paced", "fast pacing"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "experimental" },
    defaultEvidenceStrategy: "semantic_required",
    mustSafety: "unsafe", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Kısa eser otomatik hızlı değildir.",
  },
  character_driven: {
    id: "character_driven", group: "experience", labelTr: "Karakter odaklı", labelEn: "Character Driven",
    descriptionTr: "İlerleyişi karakter kararlarının taşıması.", aliasesTr: ["karakter merkezli", "karakter çalışması"], aliasesEn: ["character study", "character focused"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "partial", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "partial" },
    defaultEvidenceStrategy: "semantic_required",
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Drama genre tek başına yeterli değildir.",
  },
  plot_driven: {
    id: "plot_driven", group: "experience", labelTr: "Olay örgüsü odaklı", labelEn: "Plot Driven",
    descriptionTr: "İlerleyişi dış olayların taşıması.", aliasesTr: ["olay odaklı", "hikâye odaklı"], aliasesEn: ["story driven", "plot focused"], supportedMediaTypes: ALL,
    providerSupport: { anilist: "experimental", tvmaze: "experimental", tmdb: "experimental", omdb: "experimental", openlibrary: "experimental" },
    defaultEvidenceStrategy: "semantic_required",
    mustSafety: "unsafe", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Karakter odaklılıkla aynı anda bulunabilir.",
  },
  episodic: {
    id: "episodic", group: "experience", labelTr: "Bölümsel yapı", labelEn: "Episodic",
    descriptionTr: "Bölümlerin büyük ölçüde bağımsız olması.", aliasesTr: ["epizodik", "bölüm bölüm"], aliasesEn: ["case of the week", "episodic structure"], supportedMediaTypes: SCREEN,
    providerSupport: { anilist: "partial", tvmaze: "partial", tmdb: "experimental", omdb: "experimental", openlibrary: "unsupported" },
    defaultEvidenceStrategy: "semantic_required",
    mustSafety: "conditional", avoidSafety: "conditional", semanticVerifier: "required_for_hard_decision", limitationNoteTr: "Episode metadata anlatı yapısını tek başına kanıtlamaz.",
  },
} as const satisfies Record<string, AspectRegistryEntry>;

export type AspectId = keyof typeof ASPECT_REGISTRY;

export const ASPECT_IDS = Object.freeze(Object.keys(ASPECT_REGISTRY) as AspectId[]);

export function normalizeAspectAlias(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function isAspectId(value: unknown): value is AspectId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ASPECT_REGISTRY, value);
}

export function getAspectDefinition(id: AspectId): (typeof ASPECT_REGISTRY)[AspectId] {
  return ASPECT_REGISTRY[id];
}

export function evidenceStrategyForProvider(
  id: AspectId,
  provider: RecommendationProvider,
): AspectEvidenceStrategy {
  const entry = ASPECT_REGISTRY[id] as AspectRegistryEntry;
  return entry.providerStrategyOverrides?.[provider] ?? entry.defaultEvidenceStrategy;
}

export function findAspectByAlias(value: string, language: "tr" | "en"): AspectId | null {
  const normalized = normalizeAspectAlias(value);
  if (!normalized) return null;
  for (const id of ASPECT_IDS) {
    const entry = ASPECT_REGISTRY[id];
    const candidates = language === "tr"
      ? [entry.labelTr, ...entry.aliasesTr]
      : [entry.labelEn, ...entry.aliasesEn];
    if (candidates.some((candidate) => normalizeAspectAlias(candidate) === normalized)) return id;
  }
  return null;
}
