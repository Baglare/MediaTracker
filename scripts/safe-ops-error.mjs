// Ops may report known gate names, never credential values or arbitrary SDK errors.
const SAFE_MESSAGES = new Set([
  "D8 environment file was not found at the resolved application root",
  "D8 staging safety gate closed: D8_STAGING_CUTOVER_ENABLED must be 1",
  "D8 staging migration permission is not explicit",
  "D8 project refs have an invalid format",
  "D8 staging target refused: staging and production refs match",
  "D8 staging database URL must use PostgreSQL",
  "D8 staging database host is not bound to the explicit staging ref",
  "SQL path escaped repository root",
  "psql is unavailable; no database operation was performed",
  "DURDURULDU: SUPABASE_TEST_URL production Supabase origin ile eşleşiyor.",
  "SUPABASE_TEST_URL geçerli bir HTTP(S) URL olmalı.",
  "Production Supabase URL geçerli bir HTTP(S) URL olmalı.",
]);
const NAMES = new Set(["SUPABASE_TEST_URL", "SUPABASE_TEST_ANON_KEY", "SUPABASE_TEST_USER_A_EMAIL", "SUPABASE_TEST_USER_A_PASSWORD", "SUPABASE_TEST_USER_B_EMAIL", "SUPABASE_TEST_USER_B_PASSWORD", "D8_STAGING_PROJECT_REF", "D8_PRODUCTION_PROJECT_REF", "D8_STAGING_DATABASE_URL"]);
export function safeOpsError(error, fallback) {
  try {
    const message = error instanceof Error ? Object.getOwnPropertyDescriptor(error, "message")?.value : undefined;
    if (typeof message !== "string" || message.length > 512) return fallback;
    if (SAFE_MESSAGES.has(message)) return message;
    for (const prefix of ["Eksik environment değişkenleri: ", "D8 staging safety gate missing: "]) {
      if (message.startsWith(prefix)) {
        const names = message.slice(prefix.length).split(", ");
        if (names.length > 0 && names.every((name) => NAMES.has(name))) return prefix + names.join(", ");
      }
    }
  } catch { /* Untrusted errors fail closed. */ }
  return fallback;
}
