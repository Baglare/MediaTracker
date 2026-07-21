import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SocialProfileView } from "@/components/social/social-profile-view";
import { loadSocialProfile } from "@/lib/social/server";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} · MediaTracker`, description: "MediaTracker sosyal profili" };
}

export default async function SocialProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const payload = await loadSocialProfile(username);
  if (payload.redirectUsername) redirect(`/u/${payload.redirectUsername}`);
  return <SocialProfileView payload={payload} />;
}
