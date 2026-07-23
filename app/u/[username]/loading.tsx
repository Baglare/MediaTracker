import { LoadingState } from "@/components/ui/loading-state";

export default function SocialProfileLoading() {
  return <div className="mx-auto max-w-6xl space-y-5" aria-label="Public profil yükleniyor"><LoadingState label="Profil kimliği yükleniyor…" rows={6}/><div className="grid gap-4 md:grid-cols-2"><LoadingState label="Profil modülleri yükleniyor…" rows={4}/><LoadingState label="Profil ilerlemesi yükleniyor…" rows={4}/></div></div>;
}
