import type { Metadata } from "next";

import { ProfilePageClient } from "@/components/profile/profile-page-client";

export const metadata: Metadata = { title: "Profil · MediaTracker", description: "MediaTracker birleşik profil kimliği." };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <ProfilePageClient initialMode={mode === "edit" ? "edit" : "view"} />;
}
