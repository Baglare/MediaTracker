import Link from "next/link";

import { PeopleSearch } from "@/components/social/people-search";

export const metadata = { title: "Kullanıcı Ara · MediaTracker", description: "MediaTracker public ve korumalı sosyal profillerini ara." };

export default function PeoplePage() {
  return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100"><div className="mx-auto max-w-3xl"><Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200">← MediaTracker</Link><div className="my-6"><h1 className="text-3xl font-bold">Kullanıcı Ara</h1><p className="mt-2 text-sm text-zinc-400">Public ve korumalı profilleri kullanıcı adı veya görünen adla bul.</p></div><PeopleSearch /></div></main>;
}
