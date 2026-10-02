# D8 post-deploy smoke checklist

Her sonuç pass/fail/skip ve timestamp ile kaydedilir; secret veya tam project ref yazılmaz.

- [ ] Production target/ref ve deployed commit/artifact kimliği onaylıdır.
- [ ] Health/page load ve security headers beklenen contract'tadır.
- [ ] Guest/local-first kullanılabilir; signup UI yoktur ve direct Supabase signup provider boundary'de güvenli reddedilir; mevcut kullanıcı sign-in çalışır.
- [ ] Guest server-funded AI/provider erişimi alamaz.
- [ ] Normal user capability `isAdmin=false`; forged provider/research/admin değerleri etkisizdir.
- [ ] Admin dahil tüm kullanıcılar için server provider capability false kalır; ücretli provider çağrısı yapılmaz.
- [ ] Research rollout/shadow/citations/evidence-cache ve persistent embedding cache disabled kalır; raw prompt/passage/response persist edilmez.
- [ ] Media/Progress owner A/B cross-read ve cross-mutation DB/RLS tarafından reddedilir.
- [ ] Goal Cloud CRUD/revision/idempotency/tombstone ve owner isolation geçer.
- [ ] Public profile hidden/preset/custom projection private alan sızdırmaz.
- [ ] Avatar/banner upload/delete revision ve signed URL invalidation geçer; unreferenced/cleared owner path non-owner için reddedilir ve account switch eski asset göstermez.
- [ ] TVMaze ve yalnız gerçek contact UA varsa Open Library POST search fail-soft çalışır; URL'de query yoktur. AniList/TMDB/OMDb yeni public çağrı başlatmaz.
- [ ] 320/375/390/1366/1536 viewport'larda horizontal overflow, hydration veya console error yoktur.
- [ ] Cloud status/maintenance/epoch ve schema feature flag'leri post-check ile uyumludur.
- [ ] Aktif provider attribution görünürdür; disabled/dormant adapter aktif kaynak gibi gösterilmez.
- [ ] Cloud/auth/provider hata telemetrisi safe/redacted; rollback/fail-forward sahibi ve incident iletişimi hazırdır.
