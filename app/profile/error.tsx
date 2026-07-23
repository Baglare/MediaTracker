"use client";

import { PageError } from "@/components/ui/page-error";

export default function ProfileError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return <PageError title="Profil" description="Profil görünümü şu anda kullanılamıyor." retry={unstable_retry} />;
}
