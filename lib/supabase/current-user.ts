import "server-only";

import { cache } from "react";

import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentServerAuth {
  configured: boolean;
  userId: string | null;
}

/** Request-local auth lookup shared by layouts and pages in the same RSC render. */
export const getCurrentServerAuth = cache(async (): Promise<CurrentServerAuth> => {
  const client = await getSupabaseServerClient();
  if (!client) return { configured: false, userId: null };
  const { data } = await client.auth.getUser();
  return { configured: true, userId: data.user?.id ?? null };
});
