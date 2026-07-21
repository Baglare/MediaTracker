import { NextResponse } from "next/server";

import { validateUserId } from "@/lib/social/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const FOLLOW_ACTIONS = new Set(["unfollow", "cancel", "accept", "reject", "remove_follower"]);

export async function POST(request: Request) {
  const client = await getSupabaseServerClient();
  if (!client) return NextResponse.json({ ok: false, message: "Sosyal sistem yapılandırılmamış." }, { status: 503 });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return NextResponse.json({ ok: false, message: "Bu işlem için giriş yapmalısın." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, message: "İstek geçersiz." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ ok: false, message: "İstek geçersiz." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const target = validateUserId(input.targetId);
  if (!target.ok) return NextResponse.json({ ok: false, message: target.error }, { status: 400 });
  let result: Awaited<ReturnType<typeof client.rpc>>;
  if (input.action === "follow") result = await client.rpc("social_follow", { p_target: target.value });
  else if (input.action === "block") result = await client.rpc("social_block", { p_target: target.value });
  else if (input.action === "unblock") result = await client.rpc("social_unblock", { p_target: target.value });
  else if (typeof input.action === "string" && FOLLOW_ACTIONS.has(input.action)) result = await client.rpc("social_follow_action", { p_action: input.action, p_other: target.value });
  else return NextResponse.json({ ok: false, message: "İlişki işlemi geçersiz." }, { status: 400 });
  if (result.error) return NextResponse.json({ ok: false, message: "İşlem uygulanamadı veya profil kullanılamıyor." }, { status: 409 });
  return NextResponse.json(result.data);
}
