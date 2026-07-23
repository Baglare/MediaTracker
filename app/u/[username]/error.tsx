"use client";

import { PageError } from "@/components/ui/page-error";

export default function PublicProfileError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return <PageError title="Public profil" description="Bu profil şu anda kullanılamıyor." retry={unstable_retry} />;
}
