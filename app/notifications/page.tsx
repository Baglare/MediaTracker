import { Bell } from "lucide-react";

import { NotificationCenter } from "@/components/social/notification-center";
import { SocialPageShell,SocialSignInRequired } from "@/components/social/social-page-shell";
import { getCurrentServerAuth } from "@/lib/supabase/current-user";

export const dynamic="force-dynamic";export const revalidate=0;export const metadata={title:"Bildirimler · MediaTracker",description:"MediaTracker sosyal bildirim merkezi."};
export default async function NotificationsPage(){const auth=await getCurrentServerAuth();return !auth.configured?<SocialSignInRequired configured={false}/>:!auth.userId?<SocialSignInRequired/>:<SocialPageShell eyebrow="Sosyal" title="Bildirimler" subtitle="Takip, yorum, tepki ve medya önerisi olaylarını burada takip et." icon={<Bell className="h-5 w-5" aria-hidden="true"/>}><NotificationCenter/></SocialPageShell>;}
