import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseApplicationError } from "@/lib/supabase/safe-error";

export function accountWriteLockedResponse(error: unknown): Response | null {
  if (supabaseApplicationError(error).message !== "account_write_locked") return null;
  return Response.json({ code: "account_write_locked", message: "Hesap yazma işlemleri şu anda kullanılamıyor." },
    { status: 423, headers: { "Cache-Control": "private, no-store" } });
}

/** Own-account preflight for controlled HTTP errors. DB triggers remain the
 * authority: the account can be locked after this read and before the write. */
export async function checkAccountWriteAllowed(): Promise<Response | null> {
  const client = await getSupabaseServerClient();
  if (!client) return Response.json({ code: "account_write_unavailable" }, { status: 503 });
  const { error } = await client.rpc("assert_account_write_allowed");
  if (!error) return null;
  return accountWriteLockedResponse(error)
    ?? Response.json({ code: "account_write_unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
}
