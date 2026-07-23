"use client";

import { PageError } from "@/components/ui/page-error";

export default function FeedError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return <PageError title="Aktivite Akışı" description="Sosyal akış şu anda kullanılamıyor." tone="social" retry={unstable_retry} />;
}
