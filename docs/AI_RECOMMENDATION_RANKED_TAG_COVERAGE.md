# Ranked-Tag Provider Coverage

Tarih: 6 Ağustos 2026

Bu matris [`ranked-tag-provider-coverage.ts`](../features/recommendations/domain/ranked-tag-provider-coverage.ts) read-model'inin public karşılığıdır. Registry'deki 21 `ranked_tag` aspect otomatik çıkarılır; her aspect beş provider için kayıt taşır. UI label canonical provider taxonomy değildir.

Kısaltmalar: `MQ` mapped/queryable, `EO` evidence-only, `SC` semantic confirmation required, `U` unsupported. `EO`, hard must discovery desteği anlamına gelmez.

| Aile | Aspect | AniList | TMDB | Open Library | TVMaze | OMDb | Canonical query mapping |
|---|---|---|---|---|---|---|---|
| Narrative | political_intrigue | MQ | EO | EO | U | U | AniList `Politics`, rank 40/20 |
| Narrative | power_progression | SC | SC | SC | U | U | Yok; bileşik kavram |
| Narrative | revenge | MQ | EO | EO | U | U | AniList `Revenge`, rank 40/20 |
| Narrative | survival | EO | EO | EO | U | U | Yok |
| Narrative | found_family | SC | SC | SC | U | U | Yok; ilişki merkeziliği gerekir |
| Narrative | coming_of_age | SC | SC | SC | U | U | Yok; gelişim merkeziliği gerekir |
| Narrative | academy | EO | EO | EO | U | U | Yok |
| Narrative | time_travel | EO | EO | EO | U | U | Yok |
| Narrative | game_system | EO | EO | EO | U | U | Yok |
| Narrative | isekai | EO | EO | EO | U | U | Yok |
| Narrative | antihero | SC | SC | SC | U | U | Yok; protagonist rolü gerekir |
| Relationship | love_triangle | EO | EO | EO | U | U | Yok; güvenli mapping kanıtlanmadı |
| Relationship | enemies_to_lovers | SC | SC | SC | U | U | Yok |
| Relationship | friendship_focus | SC | SC | SC | U | U | Yok |
| Relationship | family_focus | SC | SC | SC | U | U | Yok |
| Tone/content | dark | SC | SC | SC | U | U | Yok; geniş ton kavramı |
| Tone/content | tragic | EO | EO | EO | U | U | Yok |
| Tone/content | violence_gore | EO | EO | EO | U | U | Yok; avoid post-evidence |
| Tone/content | fanservice | EO | EO | U | U | U | Yok; avoid post-evidence |
| Tone/content | sexual_content | EO | EO | EO | U | U | Yok; avoid post-evidence |
| Tone/content | disturbing_content | SC | SC | SC | U | U | Yok; geniş/hassas kavram |

## Aspect düzeyi dağılım

- `mapped_queryable` (2): `political_intrigue`, `revenge`.
- `evidence_only` (10): `survival`, `academy`, `time_travel`, `game_system`, `isekai`, `love_triangle`, `tragic`, `violence_gore`, `fanservice`, `sexual_content`.
- `semantic_confirmation_required` (9): `power_progression`, `found_family`, `coming_of_age`, `antihero`, `enemies_to_lovers`, `friendship_focus`, `family_focus`, `dark`, `disturbing_content`.
- Bütün provider'larda unsupported olan ranked-tag aspect yoktur. Provider bazında TVMaze ve OMDb ranked taxonomy authority değildir; Open Library `fanservice` için unsupported'dır.

`Politics` ve `Revenge` önce repository retrieval contract'ından gelir; conditional live smoke aynı exact tag adlarını AniList media tags alanında, strict 40 ve relaxed 20 sorgularında finite rank ile doğruladı. Tek eser gözlemi kalıcı mapping'in tek kaynağı yapılmadı ve yeni mapping eklenmedi.

Canonical mapping olmayan hard must generic title-search'e düşmez. `love_triangle`, `power_progression`, `found_family`, `antihero`, `dark` ve `disturbing_content` için label'dan tag türetilmez. İçerik avoid koşulları pozitif discovery/coverage üretmez; post-evidence eligibility'de uygulanır.

