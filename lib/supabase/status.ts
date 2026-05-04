// ============================================
// Supabase Yapılandırma Durumu
// ============================================
// Env değişkenlerinin dolu olup olmadığını kontrol eder.
// UI'da "Cloud hazır / yapılandırılmadı" göstermek için kullanılır.

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && url.length > 0 && anonKey && anonKey.length > 0);
}

export function getSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
