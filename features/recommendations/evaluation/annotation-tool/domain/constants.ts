import type { AspectId } from "../../../domain/aspect-registry";

export const DEFAULT_MVP_ASPECT_IDS = [
  "romance",
  "fantasy",
  "action",
  "comedy",
  "political_intrigue",
  "power_progression",
  "love_triangle",
  "fanservice",
  "dark",
  "slow_burn",
  "character_driven",
  "plot_driven",
] as const satisfies readonly AspectId[];

export const EXPANSION_ASPECT_IDS = [
  "revenge",
  "academy",
  "horror",
  "mystery",
] as const satisfies readonly AspectId[];

export const ANNOTATION_TOOL_LIMITS = {
  workspaceManifestBytes: 256 * 1024,
  importBundleBytes: 5 * 1024 * 1024,
  annotationStateBytes: 5 * 1024 * 1024,
  exportBundleBytes: 10 * 1024 * 1024,
  auditLogBytes: 5 * 1024 * 1024,
  maxBackupsPerWorkspace: 10,
  adjudicationRationale: 500,
  revocationNote: 500,
  requestBytes: 5 * 1024 * 1024,
} as const;

export const ANNOTATION_LABEL_UI = {
  absent: "Yok",
  incidental: "İkincil",
  significant: "Belirgin",
  primary: "Ana unsur",
  insufficient_evidence: "Yetersiz kanıt",
} as const;

export const ANNOTATION_CONFIDENCE_UI = {
  low: "Düşük",
  medium: "Orta",
  high: "Yüksek",
} as const;
