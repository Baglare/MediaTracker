import { PeopleSearch } from "@/components/social/people-search";
import { SocialPageShell } from "@/components/social/social-page-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kullanıcı Ara · MediaTracker", description: "MediaTracker public ve korumalı sosyal profillerini ara." };

export default async function PeoplePage() {
  return <SocialPageShell title="Kullanıcı Ara" subtitle="Public ve korumalı profilleri kullanıcı adı veya görünen adla bul."><PeopleSearch /></SocialPageShell>;
}
