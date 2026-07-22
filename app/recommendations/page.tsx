import { RecommendationInbox } from "@/components/social/recommendation-inbox";
import { SocialPageShell,SocialSignInRequired } from "@/components/social/social-page-shell";
import { validateUuid } from "@/lib/social/interactions-validation";
import { getCurrentServerAuth } from "@/lib/supabase/current-user";

export const dynamic="force-dynamic";export const revalidate=0;export const metadata={title:"Öneriler · MediaTracker",description:"Yapılandırılmış medya önerileri ve yaşam döngüsü."};
export default async function RecommendationsPage({searchParams}:{searchParams:Promise<{to?:string;compose?:string}>}){const [auth,params]=await Promise.all([getCurrentServerAuth(),searchParams]);const recipient=params.to?validateUuid(params.to):null;return !auth.configured?<SocialSignInRequired configured={false}/>:!auth.userId?<SocialSignInRequired/>:<SocialPageShell title="Medya Önerileri" subtitle="Gelen ve gönderilen önerileri cevap ve ilerleme durumlarıyla yönet."><RecommendationInbox userId={auth.userId} initialRecipientId={recipient?.ok?recipient.value:undefined} composeInitially={params.compose==="1"}/></SocialPageShell>;}
