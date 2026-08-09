# D8 production rollback ve fail-forward

## Genel karar sırası

1. Yeni mutation'ı maintenance/feature flag ile durdur.
2. Uygulama artifact'ını önceki uyumlu sürüme döndürmenin yeni schema ile güvenli olduğunu doğrula.
3. Additive nesneleri aceleyle silme; erişimi kapatıp fail-forward düzeltmeyi tercih et.
4. Veri bütünlüğü belirsizse owner verisini dönüştürme/silme; PITR ve DBA incelemesine geç.

## Aşama bazlı politika

- **D8 public theme:** Default `hidden` ve flag/UI kapatma geri dönüş yüzeyidir. Kolon/RPC drop edilmez; invalid snapshot server-side fail-closed düzeltilir.
- **Profile asset visibility:** Yeni exact-path policy geri açılmaz. Signed URL sorunu çıkarsa upload/public asset yüzeyi geçici kapatılır; owner erişimi korunarak policy forward migration ile düzeltilir. Eski owner-profile-visible policy'ye dönülmez.
- **D2C.1:** PK/FK ve legacy grant değişikliği gerçekçi bir otomatik rollback değildir. Post-check geçmezse maintenance açık kalır, yeni mutation engellenir ve forward repair uygulanır. Legacy global-ID mutation yolu yeniden açılmaz.
- **Goal Cloud V1:** Feature flag kapatılır ve local-first Goal akışı korunur. Additive tablolar/RPC'ler veri varken drop edilmez; owner/RLS/revision hatası forward migration ile giderilir.
- **App deploy:** Yeni binary schema ile backward-compatible ise artifact rollback yapılabilir; değilse maintenance altında forward deploy gerekir.

## Incident evidence

Yalnız aggregate row count, migration version, safe error code, süre ve policy/function adı tutulur. Raw row, kullanıcı credential'ı, provider key'i, prompt/passage veya provider response incident log'una yazılmaz.
