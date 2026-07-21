import { NotificationCenter } from "@/components/social/notification-center";
import { SocialPageShell,SocialSignInRequired } from "@/components/social/social-page-shell";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";export const revalidate=0;export const metadata={title:"Bildirimler · MediaTracker",description:"MediaTracker sosyal bildirim merkezi."};
export default async function NotificationsPage(){const client=await getSupabaseServerClient();if(!client)return <SocialSignInRequired configured={false}/>;const {data}=await client.auth.getUser();if(!data.user)return <SocialSignInRequired/>;return <SocialPageShell title="Bildirimler" subtitle="Takip, yorum, tepki ve medya önerisi olaylarını burada takip et."><NotificationCenter/></SocialPageShell>;}
