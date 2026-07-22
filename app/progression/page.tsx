import { ProgressionDashboard } from "@/components/xp/progression-dashboard";
import { SocialPageShell } from "@/components/social/social-page-shell";
import { getCurrentServerAuth } from "@/lib/supabase/current-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgressionPage() {
  const auth = await getCurrentServerAuth();
  return <SocialPageShell title="İlerlemem" subtitle="XP V2 yolculuğun, dünyaların, uzmanlıkların, görevlerin ve rozetlerin.">
    {!auth.userId ? <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400">XP V2 ilerlemesini görmek için giriş yapmalısın.</div> : <ProgressionDashboard />}
  </SocialPageShell>;
}
