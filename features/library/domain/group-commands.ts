import { generateManualGroupId, type ManualGroupAction } from "@/features/library/domain/group-types";
import type { MediaItem } from "@/lib/types";

const SERIES_KEYS = [
  "seriesGroupId",
  "seriesGroupTitle",
  "seriesRelationType",
  "seasonNumber",
  "orderIndex",
] as const;

type SeriesPatch = Partial<Pick<MediaItem, (typeof SERIES_KEYS)[number]>>;

function applySeriesPatch(target: MediaItem, patch: SeriesPatch): MediaItem {
  const next: MediaItem = { ...target };
  const mutable = next as unknown as Record<string, unknown>;
  for (const key of SERIES_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined) delete mutable[key];
    else mutable[key] = value;
  }
  return next;
}

export function applyManualGroupAction(
  media: readonly MediaItem[],
  action: ManualGroupAction,
): { next: MediaItem[]; changed: MediaItem[] } {
  const changed: MediaItem[] = [];
  const update = (item: MediaItem, patch: SeriesPatch) => {
    const next = applySeriesPatch(item, patch);
    changed.push(next);
    return next;
  };

  if (action.kind === "create" || action.kind === "join") {
    const groupId = action.kind === "create" ? generateManualGroupId() : action.groupId;
    return {
      next: media.map((item) => item.id === action.itemId
        ? update(item, {
          seriesGroupId: groupId,
          seriesGroupTitle: action.groupTitle,
          seriesRelationType: action.relationType,
          seasonNumber: action.seasonNumber,
          orderIndex: action.orderIndex,
        })
        : item),
      changed,
    };
  }

  if (action.kind === "leave") {
    return {
      next: media.map((item) => item.id === action.itemId
        ? update(item, {
          seriesGroupId: undefined,
          seriesGroupTitle: undefined,
          seriesRelationType: undefined,
          seasonNumber: undefined,
          orderIndex: undefined,
        })
        : item),
      changed,
    };
  }

  return {
    next: media.map((item) =>
      item.seriesGroupId === action.groupId && item.seriesGroupTitle !== action.newTitle
        ? update(item, { seriesGroupTitle: action.newTitle })
        : item),
    changed,
  };
}
