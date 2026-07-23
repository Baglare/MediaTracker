"use client";

import { useMemo } from "react";
import type { EastSubFilter, ThemeFilter } from "@/components/media-filters";
import type { LibrarySort } from "@/components/library-control-bar";
import type { MediaItem, MediaStatus, MediaType, ProgressLog } from "@/lib/types";
import {
  selectLibraryReadModel,
  type LibraryReadModel,
} from "@/features/library/domain/selectors";

interface UseLibraryViewModelInput {
  media: MediaItem[];
  logs: ProgressLog[];
  query: string;
  type: MediaType | "all";
  status: MediaStatus | "active" | "all";
  world: ThemeFilter;
  eastSubtype: EastSubFilter;
  sort: LibrarySort;
}

export function useLibraryViewModel(input: UseLibraryViewModelInput): LibraryReadModel {
  return useMemo(
    () =>
      selectLibraryReadModel({
        media: input.media,
        logs: input.logs,
        filters: {
          query: input.query,
          type: input.type,
          status: input.status,
          world: input.world,
          eastSubtype: input.eastSubtype,
        },
        sort: input.sort,
      }),
    [
      input.media,
      input.logs,
      input.query,
      input.type,
      input.status,
      input.world,
      input.eastSubtype,
      input.sort,
    ],
  );
}
