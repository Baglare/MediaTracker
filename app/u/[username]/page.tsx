import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { consumeRateLimit } from "@/lib/api/distributed-rate-limit";

import { SocialProfileView } from "@/components/social/social-profile-view";
import { loadSocialProfile } from "@/lib/social/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} · MediaTracker`, description: "MediaTracker sosyal profili" };
}

export default async function SocialProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const decision = await consumeRateLimit(new Request("https://media-tracker.invalid/u", { headers: await headers() }), "social_read");
  if (!decision.allowed) return <main role="status">Profil şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.</main>;
  const payload = await loadSocialProfile(username);
  if (payload.redirectUsername) redirect(`/u/${payload.redirectUsername}`);
  return <SocialProfileView payload={payload} />;
}
