import type { SocialRelationshipSummary } from "@/lib/social/types";

const COLORS: Record<SocialRelationshipSummary["ownerColor"], string> = {
  neutral: "#a1a1aa", violet: "#8b5cf6", blue: "#3b82f6", cyan: "#06b6d4", emerald: "#10b981",
  amber: "#f59e0b", orange: "#f97316", red: "#ef4444", rose: "#f43f5e", pink: "#ec4899",
};

const LABELS: Record<SocialRelationshipSummary["state"], string> = {
  none: "Bağ yok", viewer_follows: "Takip ediyorsun", owner_follows: "Seni takip ediyor", mutual: "Karşılıklı",
  outbound_pending: "İstek bekliyor", inbound_pending: "İstek gönderdi", self: "Profil bağlantı özeti", anonymous: "Bağlantıyı görmek için giriş yap",
};

export function YinYangConnection({ relationship, following = 0, followers = 0 }: { relationship: SocialRelationshipSummary; following?: number; followers?: number }) {
  const yinActive = relationship.state === "owner_follows" || relationship.state === "mutual";
  const yangActive = relationship.state === "viewer_follows" || relationship.state === "mutual";
  const yinPending = relationship.state === "inbound_pending";
  const yangPending = relationship.state === "outbound_pending";
  const label = `${LABELS[relationship.state]}. Takip ${following}, takipçi ${followers}.`;
  return (
    <div className="flex items-center gap-3" title={label} role="img" aria-label={label}>
      <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" role="img" aria-hidden="true">
        <path d="M24 3a21 21 0 0 0 0 42c-6 0-10.5-4.7-10.5-10.5S18 24 24 24s10.5-4.7 10.5-10.5S30 3 24 3Z" fill={yinActive ? COLORS[relationship.ownerColor] : "transparent"} stroke="#71717a" strokeWidth="2" strokeDasharray={yinPending ? "3 3" : undefined} opacity={yinPending ? 0.55 : 1} />
        <path d="M24 3a21 21 0 0 1 0 42c6 0 10.5-4.7 10.5-10.5S30 24 24 24s-10.5-4.7-10.5-10.5S18 3 24 3Z" fill={yangActive ? COLORS[relationship.viewerColor] : "transparent"} stroke="#71717a" strokeWidth="2" strokeDasharray={yangPending ? "3 3" : undefined} opacity={yangPending ? 0.55 : 1} />
        <circle cx="24" cy="13.5" r="2.5" fill={yinActive ? "#18181b" : "#71717a"} />
        <circle cx="24" cy="34.5" r="2.5" fill={yangActive ? "#18181b" : "#71717a"} />
      </svg>
      <div className="min-w-0 text-sm">
        <p className="font-medium text-zinc-200">{LABELS[relationship.state]}</p>
        <p className="text-xs text-zinc-500">Takip {following} · {followers} Takipçi</p>
      </div>
    </div>
  );
}
