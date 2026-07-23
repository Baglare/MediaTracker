import type { SeriesRelationType } from "@/lib/types";

export type ManualGroupAction =
  | {
      kind: "create";
      itemId: string;
      groupTitle: string;
      relationType?: SeriesRelationType;
      seasonNumber?: number;
      orderIndex?: number;
    }
  | {
      kind: "join";
      itemId: string;
      groupId: string;
      groupTitle: string;
      relationType?: SeriesRelationType;
      seasonNumber?: number;
      orderIndex?: number;
    }
  | {
      kind: "leave";
      itemId: string;
    }
  | {
      kind: "rename";
      groupId: string;
      newTitle: string;
    };

export function generateManualGroupId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `manual-series:${Date.now().toString(36)}-${random}`;
}
