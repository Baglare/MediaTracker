// ============================================
// Supabase Browser/Client Component Helper
// ============================================
// Client component'lerde kullanılacak Supabase instance'ını döner.
// Env yoksa null döner — uygulama yerel modda çalışmaya devam eder.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./status";
import type { Database } from "./types";

let cachedClient: SupabaseClient<Database> | null = null;

/**
 * Browser tarafında çağrılmak üzere Supabase client döner.
 * Env eksikse null döner; çağıran tarafın null kontrolü yapması gerekir.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (cachedClient) return cachedClient;
  const env = getSupabaseEnv();
  if (!env) return null;
  cachedClient = createBrowserClient<Database>(env.url, env.anonKey);
  return cachedClient;
}
