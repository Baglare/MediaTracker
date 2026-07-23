"use client";

import { PageError } from "@/components/ui/page-error";

export default function PeopleError({ unstable_retry }: { error: Error; unstable_retry: () => void }) {
  return <PageError title="Kullanıcı Ara" description="Kullanıcı keşfi şu anda kullanılamıyor." tone="social" retry={unstable_retry} />;
}
