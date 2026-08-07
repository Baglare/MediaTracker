import type { AspectAnnotationRecord } from "@/features/recommendations/evaluation/dataset";

const createdAt = "2026-08-06T00:00:00.000Z";

export const SYNTHETIC_CONTRADICTORY_ANNOTATIONS: readonly AspectAnnotationRecord[] = [
  {
    version: 1,
    annotationId: "annotation-synthetic-conflict-a",
    recordId: "synthetic-01",
    aspectId: "romance",
    label: "primary",
    confidence: "high",
    evidenceSpans: [],
    evidenceNotes: ["İlişki, sentetik çözüm kararını belirliyor."],
    contradictionNotes: [],
    annotatorId: "ann_internal_01",
    annotationRound: 1,
    createdAt,
    guidelineVersion: "d7_annotation_v1",
    labelSource: "synthetic_contract",
    assistanceMode: "unknown_legacy",
    adjudicationStatus: "pending",
  },
  {
    version: 1,
    annotationId: "annotation-synthetic-conflict-b",
    recordId: "synthetic-01",
    aspectId: "romance",
    label: "significant",
    confidence: "medium",
    evidenceSpans: [],
    evidenceNotes: ["İlişki belirgin; fakat tek tema olarak okunmayabilir."],
    contradictionNotes: ["Merkezilik eşiği üzerinde görüş ayrılığı var."],
    annotatorId: "ann_internal_02",
    annotationRound: 1,
    createdAt,
    guidelineVersion: "d7_annotation_v1",
    labelSource: "synthetic_contract",
    assistanceMode: "unknown_legacy",
    adjudicationStatus: "pending",
  },
] as const;
