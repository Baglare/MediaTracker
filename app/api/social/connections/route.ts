import { NextResponse } from "next/server";

import { validateUserId } from "@/lib/social/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const client = await getSupabaseServerClient();
  if (!client) return NextResponse.json({ ok: false, message: "Sosyal sistem yapılandırılmamış.", results: [] }, { status: 503 });
  const url = new URL(request.url);
  const owner = validateUserId(url.searchParams.get("owner"));
  const kind = url.searchParams.get("kind");
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 60);
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  if (!owner.ok || !["followers", "following", "pending"].includes(kind ?? "")) return NextResponse.json({ ok: false, message: "Liste isteği geçersiz.", results: [] }, { status: 400 });
  const { data, error } = await client.rpc("list_social_connections", { p_owner: owner.value, p_kind: String(kind), p_query: query, p_offset: offset, p_limit: 20 });
  if (error || !Array.isArray(data)) return NextResponse.json({ ok: false, message: "Liste yüklenemedi.", results: [] }, { status: 500 });
  const results = await Promise.all(data.map(async (entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const path = typeof row.avatarPath === "string" ? row.avatarPath : null;
    const signed = path ? await client.storage.from("profile-assets").createSignedUrl(path, 300) : null;
    const safe = { ...row };
    delete safe.avatarPath;
    return { ...safe, avatarUrl: signed?.error ? undefined : signed?.data.signedUrl };
  }));
  return NextResponse.json({ ok: true, results: results.filter(Boolean), offset });
}
