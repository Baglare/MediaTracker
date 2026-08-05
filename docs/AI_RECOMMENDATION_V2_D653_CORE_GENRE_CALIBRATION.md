# AI Recommendation V2 — D6-5.3 Core Genre Kalibrasyonu

## Kök neden

“Epik fantastik bir anime arıyorum. Romantizm olmasın.” isteğinde onaylanan V2 taslak `anime`, `fantasy:must:min=significant`, `romance:avoid:reject=incidental` ve `exploratory` değerlerini route'a koruyarak taşıyordu. AniList structured discover strict ve relaxed pass'lerinde `Fantasy` genre filtresi de korunuyordu. Kayıp retrieval veya registry mapping katmanında değildi.

AniList `Fantasy` genre raw claim'i `fantasy` aspect'ine doğru map ediliyor; ancak genel katkı hesabında `provider_genre base 0.55 × reliability 0.90 = 0.495` sonucu `significant=0.50` sınırının hemen altında kalıyordu. D6-5.2'de aynı semantik kayıp yalnız Romance'a özel merkezi tabanla giderilmişti. D6-5.3 bu yorumu başlığa veya aspect adına özel kural olmadan registry `group=core` ve ilgili provider için `support=strong` koşuluna bağlar.

## Merkezi core genre politikası

Authoritative kod [`aggregation.ts`](../features/recommendations/evidence/aggregation.ts) içindeki tek `strongCoreGenre` policy'sidir. Registry'de core grubunda olan ve claim provider'ında `strong` taxonomy desteği taşıyan exact `provider_genre` claim'leri için:

| Structured kanıt | Sonuç tabanı | Confidence |
|---|---|---|
| Exact genre | `significant` (`0.55`) | `medium` |
| Exact genre + orta ilgili tag rank | `significant` (`0.68`) | bağımsız alanlarla `high` |
| Exact genre + güçlü ilgili tag rank | `primary` (`0.78`) | bağımsız alanlarla `high` |
| Yalnız düşük ilgili tag | Genel bounded hesap; `incidental` | claim yapısına göre |
| Genre/tag claim yok | `unknown`, strength `null` | `unknown` |

Tag rank provider relevance sinyalidir; ekran süresi, merkeziyet yüzdesi veya doğruluk yüzdesi değildir. Duplicate claim confidence'ı şişirmez. Contradiction supporting claim'i silmez, confidence'ı düşürür. Bu başlangıç sayıları D7 gold-label kalibrasyonuna kadar sabittir.

Politika şu 13 aspect'e uygulanabilir: `action`, `adventure`, `comedy`, `drama`, `mystery`, `horror`, `fantasy`, `sci_fi`, `slice_of_life`, `supernatural`, `psychological`, `historical`, `romance`.

## Niche aspect koruması

Core genre tabanı yalnız registry `group=core` koşuluyla çalışır. `political_intrigue`, `power_progression`, `found_family`, `slow_burn`, `enemies_to_lovers`, `character_driven`, `plot_driven`, `fanservice`, `love_triangle` ve `disturbing_content` gibi aspect'ler bir Fantasy/Romance/Drama/Action genre claim'inden `significant` olmaz. Bunlar mapped tag rank, provider keyword, desteklenen başka structured claim veya gerçek semantic verifier kanıtı gerektirir.

## Provider farkları

- **AniList:** Registry'de strong olan exact core genre `significant/medium` tabanı alır. Aynı aspect'in tag rank claim'i bağımsız alan olarak bounded birleşebilir.
- **TMDB:** Yalnız registry'de TMDB support'u `strong` olan exact genre aynı tabanı alır. Keyword ayrı claim'dir.
- **TVMaze:** Mevcut registry support'u partial/experimental ise strong genre tabanı uygulanmaz. Recommendation-only anime exclusion değişmez.
- **OMDb:** Genre partial kanıttır; tek başına primary veya strong-genre tabanı üretmez.
- **Open Library:** Subject raw claim'i `provider_keyword` / `field=subjects` olarak korunur. Registry support'u strong olsa dahi subject exact provider genre sayılmaz ve strong genre tabanı almaz.

Popularity, community score, rating ve personal fit hiçbir provider'da aspect evidence değildir.

## Fantasy eligibility ve trace

- Balanced: AniList Fantasy genre-only sonucu `significant/medium` olduğundan `fantasy >= significant` must koşulunu geçebilir.
- Strict: Aynı medium-confidence sonuç mevcut strict policy nedeniyle elenir; high confidence için bağımsız güçlü structured evidence gerekir.
- Exploratory: Incidental Fantasy kanıtı primary'ye girmez, explicit request coverage varsa near-match olabilir. Fantasy claim'i tamamen unknown olan popüler aday primary veya near-match listesine doldurma amacıyla girmez.
- Romance avoid: `incidental` veya daha güçlü medium/high evidence primary'yi eler ve pozitif coverage/fit label üretmez.

`RecommendationEvidenceTrace` test/debug ortamında exact candidate identity, raw/mapped claim, aggregation, eligibility ve failed rule alanlarını bounded taşır. Normal kullanıcı response'u bu trace'i, raw reason code'u, kişisel notu veya secret'ı içermez.

## Planning provider şeffaflığı

LLM yalnız retrieval planı üretebilir; deterministic V2 eligibility ve final sıra yetkisini korur. Engine status şu alanları ayrı taşır:

- `planningProvider`
- `attemptedPlanningProviders`
- `providerPolicyMode`: `auto`, `fixed`, `mock`
- `configuredPlanningProvider`
- `openAiPreferenceApplied`
- `planningFallbackUsed`

`AI_PROVIDER=auto` ve OpenAI tercihi açıksa OpenAI planning sırasının başına alınır. Tercih kapalıysa OpenAI otomatik sıraya eklenmez. `AI_PROVIDER` sabitse checkbox provider'ı değiştirmez; interpret response'undaki secretsiz policy özeti UI kontrolünü devre dışı bırakır ve sabit provider'ı açıklar. Şeffaflık alanı planning provider'ı gösterirken “LLM final sıralama: kullanılmadı” ifadesini korur.

## Sınırlar

Bu değişiklik 43-aspect registry'yi, deterministic ranking tuple'ını, Global Search'ü, Release Calendar'ı, provider identity politikasını veya verifier threshold'larını değiştirmez. Sentetik fixture'lar sözleşmeyi doğrular; gerçek öneri kalitesi ve provider taxonomy drift'i D7 snapshot + human-label değerlendirmesine kalır.

## Doğrulama kaydı — 5 Ağustos 2026

- 13 core aspect için genre-only, genre + orta/yüksek tag, low tag-only ve no-claim sentetik contract'ları; niche koruması, provider support farkları, Fantasy retrieval/eligibility/coverage ve provider policy testleri geçti.
- Tam paket: 132 test dosyasının 127'si geçti, 5 koşullu dosya atlandı; 1.673 testin 1.639'u geçti, 34'ü atlandı. Lint ve production build geçti.
- Yerel browser fixture/UI smoke: onaylanmış Fantasy must/significant ve Romance avoid taslağı, `AI_PROVIDER=auto` OpenAI kontrolü, 1366×768, 1536×864 ve 375×812 yatay overflow kontrolü geçti; console error/warning görülmedi.
- Browser çalışması gerçek candidate retrieval başlatmadı. Sabit provider görünümü unit/contract testinde doğrulandı; mevcut yerel ortam `AI_PROVIDER=auto` olduğu için fixed-mode browser kabulü yapılmadı.
- `D6_PROVIDER_LIVE_SMOKE` kapalıydı; canlı AniList/provider trace **skip** edildi. Sonuçlar canlı öneri kalitesi kanıtı değildir.
