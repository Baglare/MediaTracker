"use client";

import { PageError } from "@/components/ui/page-error";

export default function NotificationsError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return <PageError title="Bildirimler" description="Bildirim merkezi şu anda kullanılamıyor." tone="social" retry={unstable_retry} />;
}
