import type { RecommendationEventType, RecommendationProgressStatus, RecommendationResponseStatus } from "@/lib/social/interactions";
import type { SocialPersonSummary } from "@/lib/social/types";

export type RecommendationTone = "amber" | "sky" | "emerald" | "rose" | "zinc" | "violet";
export interface StatusPresentation { label: string; tone: RecommendationTone; icon: "clock" | "pause" | "check" | "x" | "undo" | "link" | "play" | "flag" | "help"; }

const RESPONSE: Record<RecommendationResponseStatus, StatusPresentation> = {
  pending: { label: "Yanıt bekliyor", tone: "amber", icon: "clock" },
  deferred: { label: "Sonraya bırakıldı", tone: "sky", icon: "pause" },
  accepted: { label: "Kabul edildi", tone: "emerald", icon: "check" },
  rejected: { label: "Reddedildi", tone: "rose", icon: "x" },
  withdrawn: { label: "Geri çekildi", tone: "zinc", icon: "undo" },
};

const PROGRESS: Record<RecommendationProgressStatus, StatusPresentation> = {
  none: { label: "Henüz kütüphaneye bağlanmadı", tone: "zinc", icon: "clock" },
  linked: { label: "Kütüphaneye eklendi", tone: "sky", icon: "link" },
  started: { label: "Başlandı", tone: "violet", icon: "play" },
  completed: { label: "Tamamlandı", tone: "emerald", icon: "flag" },
};

const EVENTS: Record<RecommendationEventType, string> = {
  sent: "Önerildi", deferred: "Sonraya bırakıldı", accepted: "Kabul edildi", rejected: "Reddedildi",
  withdrawn: "Geri çekildi", linked: "Kütüphaneye bağlandı", started: "Başlandı", completed: "Tamamlandı",
};

const UNKNOWN: StatusPresentation = { label: "Durum bilinmiyor", tone: "zinc", icon: "help" };

export function recommendationResponsePresentation(value: unknown): StatusPresentation { return typeof value === "string" && value in RESPONSE ? RESPONSE[value as RecommendationResponseStatus] : UNKNOWN; }
export function recommendationProgressPresentation(value: unknown): StatusPresentation { return typeof value === "string" && value in PROGRESS ? PROGRESS[value as RecommendationProgressStatus] : UNKNOWN; }
export function recommendationEventLabel(value: unknown): string { return typeof value === "string" && value in EVENTS ? EVENTS[value as RecommendationEventType] : "Bilinmeyen durum"; }
export function recommendationCardMode(response: RecommendationResponseStatus): "full" | "medium" | "compact" { return response === "pending" ? "full" : response === "deferred" ? "medium" : "compact"; }

export function recipientSelectionMode(recipient?: SocialPersonSummary): "search" | "selected" { return recipient ? "selected" : "search"; }
export function recipientRelationshipLabel(person: SocialPersonSummary): string {
  const viewer = person.relationship.viewerFollowsOwner;
  const owner = person.relationship.ownerFollowsViewer;
  if (viewer === "accepted" && owner === "accepted") return "Karşılıklı";
  if (viewer === "accepted") return "Takip ediyorsun";
  if (owner === "accepted") return "Seni takip ediyor";
  return "Bağlantı yok";
}
