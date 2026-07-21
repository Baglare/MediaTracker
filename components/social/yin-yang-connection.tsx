import type { SocialRelationshipSummary } from "@/lib/social/types";
import { buildYinYangConnectionViewModel, type ConnectionPieceState } from "@/lib/social/relationships";

const COLORS: Record<SocialRelationshipSummary["ownerColor"], string> = {
  neutral: "#a1a1aa", violet: "#8b5cf6", blue: "#3b82f6", cyan: "#06b6d4", emerald: "#10b981",
  amber: "#f59e0b", orange: "#f97316", red: "#ef4444", rose: "#f43f5e", pink: "#ec4899",
};

const LABELS: Record<SocialRelationshipSummary["state"], string> = {
  none: "Bağ yok", viewer_follows: "Takip ediyorsun", owner_follows: "Seni takip ediyor", mutual: "Karşılıklı",
  outbound_pending: "İstek bekliyor", inbound_pending: "İstek gönderdi", self: "Profil bağlantı özeti", anonymous: "Bağlantıyı görmek için giriş yap",
};

export function YinYangConnection({ relationship, following = 0, followers = 0 }: { relationship: SocialRelationshipSummary; following?: number; followers?: number }) {
  const pieces = buildYinYangConnectionViewModel(relationship);
  const yin = pieceStyle(pieces.yin, COLORS[relationship.ownerColor]);
  const yang = pieceStyle(pieces.yang, COLORS[relationship.viewerColor]);
  const label = `${LABELS[relationship.state]}. Yin ${pieceLabel(pieces.yin)}, Yang ${pieceLabel(pieces.yang)}. Takip ${following}, takipçi ${followers}.`;
  return (
    <div className="flex items-center gap-3" title={label} role="img" aria-label={label}>
      <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" aria-hidden="true">
        <circle cx="24" cy="24" r="21" fill={yang.fill} fillOpacity={yang.opacity} />
        <path d="M24 3a21 21 0 0 0 0 42 10.5 10.5 0 0 0 0-21 10.5 10.5 0 0 1 0-21Z" fill={yin.fill} fillOpacity={yin.opacity} />
        {pieces.yang === "pending" && <circle cx="24" cy="24" r="18.5" fill="none" stroke={yang.stroke} strokeWidth="1.5" strokeDasharray="3 3" />}
        {pieces.yin === "pending" && <path d="M24 4.5a19.5 19.5 0 0 0 0 39 9.75 9.75 0 0 0 0-19.5 9.75 9.75 0 0 1 0-19.5Z" fill="none" stroke={yin.stroke} strokeWidth="1.5" strokeDasharray="3 3" />}
        <circle cx="24" cy="13.5" r="3" fill={yang.fill} fillOpacity={yang.opacity} stroke="#18181b" strokeWidth="0.75" />
        <circle cx="24" cy="34.5" r="3" fill={yin.fill} fillOpacity={yin.opacity} stroke="#18181b" strokeWidth="0.75" />
        <circle cx="24" cy="24" r="21" fill="none" stroke="#a1a1aa" strokeWidth="1.5" />
      </svg>
      <div className="min-w-0 text-sm">
        <p className="font-medium text-zinc-200">{LABELS[relationship.state]}</p>
        <p className="text-xs text-zinc-500">Takip {following} · {followers} Takipçi</p>
      </div>
    </div>
  );
}

function pieceStyle(state: ConnectionPieceState, color: string) {
  if (state === "active") return { fill: color, opacity: 1, stroke: color };
  if (state === "pending") return { fill: color, opacity: 0.42, stroke: "#e4e4e7" };
  return { fill: "#27272a", opacity: 1, stroke: "#71717a" };
}

function pieceLabel(state: ConnectionPieceState): string {
  if (state === "active") return "aktif";
  if (state === "pending") return "bekliyor";
  return "pasif";
}
