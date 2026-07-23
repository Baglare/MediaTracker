import { Activity } from "lucide-react";

import { ActivityFeed } from "@/components/social/activity-feed";
import { SocialPageShell,SocialSignInRequired } from "@/components/social/social-page-shell";
import { SocialPreferencesPanel } from "@/components/social/social-preferences-panel";
import { getCurrentServerAuth } from "@/lib/supabase/current-user";

export const dynamic="force-dynamic";export const revalidate=0;export const metadata={title:"Akış · MediaTracker",description:"Takip ettiğin kullanıcıların medya aktiviteleri."};
export default async function FeedPage(){const auth=await getCurrentServerAuth();return !auth.configured?<SocialSignInRequired configured={false}/>:!auth.userId?<SocialSignInRequired/>:<SocialPageShell eyebrow="Sosyal" title="Aktivite Akışı" subtitle="Kendi aktivitelerin ve kabul edilmiş takiplerinden gelen görünür medya olayları." icon={<Activity className="h-5 w-5" aria-hidden="true"/>}><div className="mb-4"><SocialPreferencesPanel userId={auth.userId}/></div><ActivityFeed viewerId={auth.userId}/></SocialPageShell>;}
