import { ProgressionDashboard } from "@/components/xp/progression-dashboard";
import { SocialPageShell } from "@/components/social/social-page-shell";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgressionPage() {
  const client = await getSupabaseServerClient();
  const { data: { user } } = client ? await client.auth.getUser() : { data: { user: null } };
  return <SocialPageShell title="İlerlemem" subtitle="XP V2 yolculuğun, dünyaların, uzmanlıkların, görevlerin ve rozetlerin.">
    {!user ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400">XP V2 ilerlemesini görmek için giriş yapmalısın.</div> : <ProgressionDashboard />}
  </SocialPageShell>;
}
