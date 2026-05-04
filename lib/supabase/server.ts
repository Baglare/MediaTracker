// ============================================
// Supabase Server Component / Route Handler Helper
// ============================================
// Server-side cookie tabanlı Supabase client taslağı.
// Şu an aktif kullanılmıyor; auth eklendiğinde devreye girecek.
//
// Kullanım örneği (gelecekte):
//   import { cookies } from "next/headers";
//   const supabase = await getSupabaseServerClient();
//   const { data: { user } } = await supabase.auth.getUser();

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./status";
import type { Database } from "./types";

/**
 * Server component / route handler'larda kullanılır.
 * Env eksikse null döner — caller null kontrolü yapmalı.
 *
 * Next.js 16 App Router'da `cookies()` async olduğu için bu helper da async.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient<Database> | null> {
  const env = getSupabaseEnv();
  if (!env) return null;

  // next/headers yalnızca server runtime'da bulunur; dinamik import build'i bozmamak için
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server component içinden cookie set'i sessizce yutulur (read-only context)
        }
      },
    },
  });
}
