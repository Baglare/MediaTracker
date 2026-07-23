import { LoadingState } from "@/components/ui/loading-state";

export default function ProfileLoading() {
  return <div className="mx-auto max-w-6xl space-y-5" aria-label="Profil yükleniyor"><LoadingState label="Profil kimliği yükleniyor…" rows={6}/><div className="grid gap-5 xl:grid-cols-2"><LoadingState label="Favoriler yükleniyor…" rows={4}/><LoadingState label="Aktiviteler yükleniyor…" rows={4}/></div></div>;
}
