import { Trophy } from "lucide-react";

import { ProgressionDashboard } from "@/components/xp/progression-dashboard";
import { SocialPageShell } from "@/components/social/social-page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentServerAuth } from "@/lib/supabase/current-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProgressionPage() {
  const auth = await getCurrentServerAuth();
  return <SocialPageShell eyebrow="Yolculuk" title="İlerlemem" subtitle="XP V2 yolculuğun, dünyaların, uzmanlıkların, görevlerin ve rozetlerin." icon={<Trophy className="h-5 w-5" aria-hidden="true"/>} tone="progression">
    {!auth.userId ? <EmptyState title="İlerleme için oturum gerekli" description="XP V2 ilerlemeni ve kazandığın unvanları görmek için hesabınla giriş yap." /> : <ProgressionDashboard />}
  </SocialPageShell>;
}
