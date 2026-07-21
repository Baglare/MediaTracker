import { ActivityFeed } from "@/components/social/activity-feed";
import { SocialPageShell,SocialSignInRequired } from "@/components/social/social-page-shell";
import { SocialPreferencesPanel } from "@/components/social/social-preferences-panel";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";export const revalidate=0;export const metadata={title:"Akış · MediaTracker",description:"Takip ettiğin kullanıcıların medya aktiviteleri."};
export default async function FeedPage(){const client=await getSupabaseServerClient();if(!client)return <SocialSignInRequired configured={false}/>;const {data}=await client.auth.getUser();if(!data.user)return <SocialSignInRequired/>;return <SocialPageShell title="Aktivite Akışı" subtitle="Kendi aktivitelerin ve kabul edilmiş takiplerinden gelen görünür medya olayları."><div className="mb-4"><SocialPreferencesPanel userId={data.user.id}/></div><ActivityFeed viewerId={data.user.id}/></SocialPageShell>;}
