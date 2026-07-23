"use client";

import { PageError } from "@/components/ui/page-error";

export default function ProgressionError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return <PageError title="İlerlemem" description="XP V2 yolculuğu şu anda kullanılamıyor." tone="progression" retry={unstable_retry} />;
}
