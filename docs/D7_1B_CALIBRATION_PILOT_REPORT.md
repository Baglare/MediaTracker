# D7-1B Calibration Mini-Pilot Raporu

Tarih: 7 Ağustos 2026

Durum: Tamamlanmış assisted/legacy calibration mini-pilot; gold, training veya evaluation acceptance datası değildir.

## Aggregate kapsam

- 10 record, 27 task ve 27 active annotation.
- Tek pseudonymous annotator; inter-annotator agreement hesaplanamaz.
- Task planında 8 aspect bulunur; workspace'in 12-aspect capability seçimi pilot kapsamı anlamına gelmez.
- Legacy kayıtlarda assistance provenance alanı yoktur. Codec bunları fail-closed `unknown_legacy` olarak okur; bağımsız human gold agreement hesabına almaz.
- 10/10 provenance review durumu `pending`dir. Record allowed-use kapsamı yalnız `annotation` ve `internal_research`dır.

## Label ve confidence dağılımı

| Boyut | Aggregate sayı |
|---|---:|
| absent | 1 |
| incidental | 2 |
| significant | 6 |
| primary | 9 |
| insufficient_evidence | 9 |
| confidence high | 22 |
| confidence medium | 5 |
| confidence low | 0 |

Annotation confidence, model confidence değildir. Bu dağılımlar yalnız input/guideline calibration sinyalidir.

## Aspect-bazlı input sufficiency

| Aspect | Annotation | Insufficient | Oran |
|---|---:|---:|---:|
| character_driven | 6 | 1 | %16,7 |
| dark | 5 | 4 | %80 |
| fanservice | 1 | 1 | %100 |
| fantasy | 5 | 0 | %0 |
| love_triangle | 2 | 1 | %50 |
| political_intrigue | 2 | 1 | %50 |
| power_progression | 2 | 0 | %0 |
| romance | 4 | 1 | %25 |

`n >= 3` ve insufficient oranı `>= %50` olan aspect mevcut input representation ile bir sonraki gold-like pilota otomatik girmez. Bu metrik annotator başarısı değil, input sufficiency metriğidir.

## Geçici kapsam kararı

- `dark`: 5 annotation içinde 4 insufficient (%80). Input strategy, annotation reference, summary design ve model-input availability yeniden incelenene kadar ana pilotta **temporarily deferred**.
- `fanservice`: Tek örnek istatistiksel karar için yetersiz ve presentation-dependent. Ayrı backlog/pilot kapsamına alındı.
- Sonraki 40–60 work human pilot başlangıç kapsamı: `romance`, `fantasy`, `political_intrigue`, `power_progression`, `love_triangle`, `character_driven`.
- `action`, `comedy`, `slow_burn`, `plot_driven` ayrı pilot/expansion için açık kalır.

Bu karar registry veya Recommendation V2 capability kapsamını değiştirmez ve final D7 model scope'u değildir.
