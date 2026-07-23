"use client";

import { PageError } from "@/components/ui/page-error";

export default function RecommendationsError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return <PageError title="Medya Önerileri" description="Öneriler şu anda kullanılamıyor." tone="social" retry={unstable_retry} />;
}
