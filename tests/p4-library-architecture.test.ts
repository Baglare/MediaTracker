import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterLibraryMedia,
  isContinuingMedia,
  resolveWorldScope,
  selectLibraryReadModel,
  sortLibraryMedia,
} from "@/features/library/domain/selectors";
import { applyManualGroupAction } from "@/features/library/domain/group-commands";
import {
  noteText,
  selectPersonalCollection,
} from "@/features/library/domain/personal-selectors";
import type { MediaItem, ProgressLog } from "@/lib/types";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("app/page.tsx");
const commandHook = read("features/library/hooks/use-media-commands.ts");
const commandHost = read("features/library/components/media-command-host.tsx");
const selectorSource = read("features/library/domain/selectors.ts");
const discoveryController = read("features/discovery/hooks/use-discovery-controller.ts");

const media = (overrides: Partial<MediaItem>): MediaItem => ({
  id: "media-1",
  title: "Örnek",
  type: "tv",
  status: "planning",
  coverImage: "/placeholders/tv.svg",
  currentProgress: 0,
  totalProgress: 10,
  ...overrides,
});

const log = (mediaId: string, createdAt: string): ProgressLog => ({
  id: `log-${mediaId}-${createdAt}`,
  mediaId,
  mediaTitle: mediaId,
  mediaType: "tv",
  action: "increment",
  amount: 1,
  unit: "bölüm",
  previousProgress: 0,
  newProgress: 1,
  createdAt,
});

describe("P4 library selectors", () => {
  const items = [
    media({ id: "east", title: "Naruto", type: "anime", status: "watching", currentProgress: 3 }),
    media({ id: "screen", title: "Arrival", type: "movie", totalProgress: 1, userRating: 9 }),
    media({ id: "arch", title: "Dune", type: "book", status: "reading", currentProgress: 20, totalProgress: 300 }),
  ];

  it("filters by normalized title without mutating source", () => {
    const copy = [...items];
    expect(filterLibraryMedia(items, {
      query: "nar",
      type: "all",
      status: "all",
      world: "all",
      eastSubtype: "all",
    }).map((item) => item.id)).toEqual(["east"]);
    expect(items).toEqual(copy);
  });

  it.each([
    ["east", "east"],
    ["screen", "screen"],
    ["library", "arch"],
  ] as const)("maps %s world scope to its media family", (world, expected) => {
    expect(filterLibraryMedia(items, {
      query: "",
      type: "all",
      status: "all",
      world,
      eastSubtype: "all",
    })[0]?.id).toBe(expected);
  });

  it("keeps active status behavior", () => {
    expect(filterLibraryMedia(items, {
      query: "",
      type: "all",
      status: "active",
      world: "all",
      eastSubtype: "all",
    }).map((item) => item.id)).toEqual(["east", "arch"]);
  });

  it("sorts ratings without mutating the input array", () => {
    const source = [...items];
    expect(sortLibraryMedia(items, "rating", items, new Map())[0]?.id).toBe("screen");
    expect(items).toEqual(source);
  });

  it("recognizes both status and progress based continue items", () => {
    expect(isContinuingMedia(items[0])).toBe(true);
    expect(isContinuingMedia(media({ status: "paused", currentProgress: 2 }))).toBe(true);
    expect(isContinuingMedia(media({ status: "completed", currentProgress: 10 }))).toBe(false);
  });

  it("groups series and produces one shared read model", () => {
    const grouped = [
      media({ id: "s1", seriesGroupId: "series", seriesGroupTitle: "Seri", status: "watching" }),
      media({ id: "s2", seriesGroupId: "series", seriesGroupTitle: "Seri" }),
      media({ id: "single" }),
    ];
    const model = selectLibraryReadModel({
      media: grouped,
      logs: [log("s1", "2026-07-23T09:00:00.000Z")],
      filters: { query: "", type: "all", status: "all", world: "all", eastSubtype: "all" },
      sort: "recent",
    });
    expect(model.seriesGroups).toHaveLength(1);
    expect(model.singletonItems.map((item) => item.id)).toEqual(["single"]);
    expect(model.continueItems[0]?.id).toBe("s1");
  });

  it("keeps settings neutral while resolving world scope centrally", () => {
    expect(resolveWorldScope("settings", "east")).toBe("neutral");
    expect(resolveWorldScope("library", "screen")).toBe("screen");
    expect(resolveWorldScope("library", "library")).toBe("arch");
  });
});

describe("P4 personal selectors and group commands", () => {
  it("normalizes legacy and current personal notes", () => {
    expect(noteText(media({ personalNotes: "  Merhaba  " }))).toBe("Merhaba");
    expect(noteText({ ...media({}), notes: [" Bir ", " Not "] } as MediaItem & { notes: string[] })).toBe("Bir Not");
  });

  it.each([
    ["favorites", media({ favorite: true })],
    ["ratings", media({ userRating: 8 })],
    ["watchlist", media({ status: "planning" })],
    ["progress", media({ status: "watching" })],
  ] as const)("selects %s collection without storage access", (kind, item) => {
    expect(selectPersonalCollection({
      media: [item],
      logs: [],
      kind,
      query: "",
      sort: "recent",
    }).visible).toHaveLength(1);
  });

  it("applies group changes without mutating unrelated fields", () => {
    const source = media({ id: "group-me", currentProgress: 7, userRating: 9 });
    const result = applyManualGroupAction([source], {
      kind: "join",
      itemId: source.id,
      groupId: "group",
      groupTitle: "Yeni Grup",
      relationType: "season",
      seasonNumber: 2,
      orderIndex: 2,
    });
    expect(result.changed).toHaveLength(1);
    expect(result.next[0]).toMatchObject({
      currentProgress: 7,
      userRating: 9,
      seriesGroupId: "group",
      seriesGroupTitle: "Yeni Grup",
    });
    expect(source.seriesGroupId).toBeUndefined();
  });
});

describe("P4 frontend architecture contracts", () => {
  it("keeps app/page as a compact composition root", () => {
    expect(page.split(/\r?\n/).length).toBeLessThan(400);
    expect(page).toContain("useMediaLibrary");
    expect(page).toContain("useMediaCommands");
    expect(page).toContain("MediaCommandHost");
    expect(page).not.toContain("<MediaModal");
    expect(page).not.toContain("localStorage.");
    expect(page).not.toMatch(/fetch\(["'`]/);
  });

  it("lazy loads inactive feature and modal boundaries", () => {
    expect(page).toContain('dynamic(');
    expect(page).toContain('features/settings/components/settings-feature');
    expect(page).toContain('features/discovery/components/discovery-feature');
    expect(commandHost).toContain('dynamic(() => import("@/components/media-modal"))');
    expect(commandHost).toContain('dynamic(() => import("@/components/media-detail-modal"))');
  });

  it("uses one discriminated overlay state", () => {
    expect(commandHook).toContain("MediaOverlayState");
    expect(commandHook).toContain('useState<MediaOverlayState>({ kind: "none" })');
    expect(commandHost).toContain('if (overlay.kind === "detail")');
    expect(commandHost).not.toContain("useState");
  });

  it("keeps pure selectors independent from React, storage and network", () => {
    expect(selectorSource).not.toContain('from "react"');
    expect(selectorSource).not.toContain("localStorage");
    expect(selectorSource).not.toMatch(/\bfetch\(/);
  });

  it("moves source network behavior out of the composition root", () => {
    expect(discoveryController).toContain("/api/tvmaze/details");
    expect(discoveryController).toContain("/api/anilist/details");
    expect(page).not.toContain("/api/");
  });

  it("preserves the persistent AppShell and URL query contracts", () => {
    expect(read("app/layout.tsx")).toContain("<RouteAppShell>{children}</RouteAppShell>");
    expect(page).toContain('parseDashboardTab(searchParams.get("tab"))');
    expect(page).toContain("router.push(dashboardTabHref(tab))");
    expect(page).not.toContain("<AppShell");
  });

  it("keeps feature boundaries from importing each other's internals", () => {
    const dashboard = read("features/dashboard/components/dashboard-feature.tsx");
    const selectors = read("features/library/domain/selectors.ts");
    expect(dashboard).not.toContain("@/features/library/");
    expect(selectors).not.toContain("@/features/dashboard/");
  });
});
