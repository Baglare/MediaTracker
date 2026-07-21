import { RecommendationInbox } from "@/components/social/recommendation-inbox";
import { SocialPageShell,SocialSignInRequired } from "@/components/social/social-page-shell";
import { validateUuid } from "@/lib/social/interactions-validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";export const revalidate=0;export const metadata={title:"Öneriler · MediaTracker",description:"Yapılandırılmış medya önerileri ve yaşam döngüsü."};
export default async function RecommendationsPage({searchParams}:{searchParams:Promise<{to?:string;compose?:string}>}){const client=await getSupabaseServerClient();if(!client)return <SocialSignInRequired configured={false}/>;const {data}=await client.auth.getUser();if(!data.user)return <SocialSignInRequired/>;const params=await searchParams;const recipient=params.to?validateUuid(params.to):null;return <SocialPageShell title="Medya Önerileri" subtitle="Gelen ve gönderilen önerileri cevap ve ilerleme durumlarıyla yönet."><RecommendationInbox userId={data.user.id} initialRecipientId={recipient?.ok?recipient.value:undefined} composeInitially={params.compose==="1"}/></SocialPageShell>;}
