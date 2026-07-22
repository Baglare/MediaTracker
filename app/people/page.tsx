import Link from "next/link";

import { PeopleSearch } from "@/components/social/people-search";

export const metadata = { title: "Kullanıcı Ara · MediaTracker", description: "MediaTracker public ve korumalı sosyal profillerini ara." };

export default function PeoplePage() {
  return <main className="app-page min-h-screen px-4 py-8"><div className="mx-auto max-w-3xl"><Link href="/" className="text-sm text-[var(--app-text-muted)] hover:text-[var(--app-text-primary)]">← MediaTracker</Link><div className="my-6"><h1 className="text-3xl font-bold text-[var(--app-text-primary)]">Kullanıcı Ara</h1><p className="mt-2 text-sm text-[var(--app-text-muted)]">Public ve korumalı profilleri kullanıcı adı veya görünen adla bul.</p></div><PeopleSearch /></div></main>;
}
