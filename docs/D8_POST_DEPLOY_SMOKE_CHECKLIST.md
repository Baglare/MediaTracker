# D8 post-deploy smoke checklist

Her sonuç pass/fail/skip ve timestamp ile kaydedilir; secret veya tam project ref yazılmaz.

- [ ] Production target/ref ve deployed commit/artifact kimliği onaylıdır.
- [ ] Health/page load ve security headers beklenen contract'tadır.
- [ ] Guest server-funded AI/provider erişimi alamaz.
- [ ] Normal user capability `isAdmin=false`; forged provider/research/admin değerleri etkisizdir.
- [ ] Admin capability `isAdmin=true`; tek bounded provider smoke yalnız explicit key/model varsa yapılır.
- [ ] Research rollout disabled ve citation UI baseline davranışı korunur.
- [ ] Media/Progress owner A/B cross-read ve cross-mutation DB/RLS tarafından reddedilir.
- [ ] Goal Cloud CRUD/revision/idempotency/tombstone ve owner isolation geçer.
- [ ] Public profile hidden/preset/custom projection private alan sızdırmaz.
- [ ] Avatar/banner upload/delete revision ve signed URL invalidation geçer; unreferenced/cleared owner path non-owner için reddedilir ve account switch eski asset göstermez.
- [ ] TMDB/AniList/TVMaze/Open Library ve lisans kararı uygunsa OMDb POST search fail-soft çalışır; URL'de query yoktur.
- [ ] 320/375/390/1366/1536 viewport'larda horizontal overflow, hydration veya console error yoktur.
- [ ] Cloud status/maintenance/epoch ve schema feature flag'leri post-check ile uyumludur.
- [ ] TMDB approved logo/notice, provider attribution ve production User-Agent/contact görünürdür.
- [ ] Alarm, 429/cost telemetry ve rollback/fail-forward sahibi hazırdır.
