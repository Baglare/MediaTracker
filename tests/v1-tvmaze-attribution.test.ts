import "./helpers/admitted-rate-limit";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tvmazeSourceUrl } from "@/lib/providers/tvmaze-source-url";
import { normalizeSearchResult } from "@/app/api/tvmaze/search/route";
import { GET as details } from "@/app/api/tvmaze/details/route";
import { mapTvmazeDetail } from "@/features/discovery/domain/media-mappers";
import { tvmazeReleaseSourceUrl, type ReleaseEvent } from "@/features/calendar/domain/release-calendar";
import { ReleaseCalendarPanel } from "@/features/calendar/components/release-calendar-panel";
import { buildReleaseAgendaFromViewItems } from "@/features/calendar/services/release-calendar-service";
import TvmazeResultCard from "@/components/tvmaze-result-card";
import GlobalSearchResultCard from "@/components/global-search-result-card";
import MediaDetailModal from "@/components/media-detail-modal";
import MediaModal from "@/components/media-modal";
import { ProfileGrid } from "@/components/social/profile-grid";
import type { SocialProfilePayload } from "@/lib/social/types";
import { createPortableBackup, decodePortableBackupForImport, inspectPortableBackupText, PORTABLE_BACKUP_VERSION } from "@/lib/portable-backup";
import type { MediaItem } from "@/lib/types";
import type { TvmazeNormalizedDetail } from "@/lib/tvmaze-types";

const fallback = "https://www.tvmaze.com/shows/123";
const slug = `${fallback}/example`;
const noop = () => {};
const detail: TvmazeNormalizedDetail = {
  externalSource: "tvmaze", externalId: "123", type: "tv", title: "Example", totalProgress: 10,
  seasonBreakdown: [{ season: 1, episodes: 5 }, { season: 2, episodes: 5 }],
};
const media = (overrides: Partial<MediaItem> = {}): MediaItem => ({ ...mapTvmazeDetail(detail).singleItem, ...overrides });
const event = (overrides: Partial<ReleaseEvent> = {}): ReleaseEvent => ({
  schemaVersion: 1, id: "tvmaze:999", mediaRecordId: "tvmaze-123", type: "episode", title: "Episode",
  date: { precision: "date_only", date: "2026-10-05" },
  origin: { kind: "provider", provider: "tvmaze", providerEventId: "999", persistence: "reproducible_cache" },
  seasonIdentity: { key: "tv-season:tvmaze:456:1", seasonNumber: 1, basis: "tvmaze_external_id", providerSource: "tvmaze", providerShowId: "456" },
  ...overrides,
});

function expectLink(html: string, href: string) {
  const anchor = html.match(/<a\b[^>]*>/g)?.find((tag) => tag.includes(`href="${href}"`));
  expect(anchor).toBeDefined();
  expect(anchor).toContain('target="_blank"');
  expect(anchor).toContain('rel="noopener noreferrer"');
  expect(anchor).toMatch(/aria-label="[^"]*TVMaze[^\"]*"/);
  expect(anchor).not.toMatch(/tabindex="-1"/i);
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("TVMaze canonical show source boundary", () => {
  it.each(["123", "123-season-2"])("resolves %s to its show", (externalId) => {
    expect(tvmazeSourceUrl({ externalSource: "tvmaze", externalId })).toBe(fallback);
  });
  it("preserves a safe matching provider slug", () => {
    expect(tvmazeSourceUrl({ ...detail, siteUrl: slug })).toBe(slug);
  });
  it.each(["javascript:alert(1)", "data:text/html,hi", "https://evil.example/shows/123", "bad url",
    "http://www.tvmaze.com/shows/123", "https://www.tvmaze.com.evil.example/shows/123",
    "https://user:pass@www.tvmaze.com/shows/123", "https://www.tvmaze.com:444/shows/123",
    "https://www.tvmaze.com/redirect?url=https://evil.example",
    "https://www.tvmaze.com/shows/123?url=https://evil.example", "https://www.tvmaze.com/shows/123#bad",
    "https://www.tvmaze.com\\@evil.example/shows/123", "https://www.tvmaze.com/shows/123\n",
    "x".repeat(2049)])("rejects unsafe site URL %s with ID fallback", (siteUrl) => {
    expect(tvmazeSourceUrl({ ...detail, siteUrl })).toBe(fallback);
    expect(tvmazeSourceUrl({ externalSource: "tvmaze", siteUrl })).toBeUndefined();
  });
  it("falls back when a safe URL identifies a different show", () => {
    expect(tvmazeSourceUrl({ ...detail, siteUrl: "https://www.tvmaze.com/shows/999" })).toBe(fallback);
  });
  it.each(["0", "-1", "abc", "123-season-0", "123-season--2", "123-season-2-extra", "123foo",
    " 123", "123 ", "1".repeat(49), "123-season-9999999", "123\n", undefined, 123])("rejects malformed ID %s", (externalId) => {
    expect(tvmazeSourceUrl({ externalSource: "tvmaze", externalId })).toBeUndefined();
  });
  it.each(["anilist", "tmdb", "openlibrary", "omdb", "manual", undefined])("does not generate another provider URL: %s", (externalSource) => {
    expect(tvmazeSourceUrl({ externalSource, externalId: "123", siteUrl: slug })).toBeUndefined();
  });
});

describe("TVMaze route and saved provenance", () => {
  it.each([slug, undefined, "javascript:alert(1)", "https://evil.example/show"])("normalizes search and detail URL %s", async (url) => {
    const show = { id: 123, name: "Example", url };
    const expected = url === slug ? slug : fallback;
    expect(normalizeSearchResult({ score: 1, show }).siteUrl).toBe(expected);
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(show)).mockResolvedValueOnce(Response.json([]));
    vi.stubGlobal("fetch", fetcher);
    const response = await details(new NextRequest("https://app.example/api/tvmaze/details?id=123"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ externalSource: "tvmaze", externalId: "123", siteUrl: expected });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([slug, undefined, "data:text/html,hi"])("preserves single and season source identity %s", (siteUrl) => {
    const { singleItem, seasonItems } = mapTvmazeDetail({ ...detail, siteUrl });
    expect(singleItem).toMatchObject({ externalSource: "tvmaze", externalId: "123", siteUrl: siteUrl === slug ? slug : fallback });
    expect(seasonItems).toHaveLength(2);
    for (const [index, item] of seasonItems!.entries()) {
      expect(item).toMatchObject({ externalSource: "tvmaze", externalId: `123-season-${index + 1}`, siteUrl: singleItem.siteUrl });
    }
  });
});

describe("TVMaze visible external attribution", () => {
  it.each([slug, undefined, "javascript:alert(1)", "https://evil.example"])("renders advanced, global and saved links safely: %s", (siteUrl) => {
    const expected = siteUrl === slug ? slug : fallback;
    const result = normalizeSearchResult({ score: 1, show: { id: 123, name: "Example" } });
    const outputs = [
      renderToStaticMarkup(createElement(TvmazeResultCard, { result: { ...result, siteUrl }, isAlreadyAdded: false, isAdding: false, onAdd: noop })),
      renderToStaticMarkup(createElement(GlobalSearchResultCard, { result: { source: "tvmaze", externalId: "123", type: "tv", title: "Example", sourceUrl: expected }, libraryStatus: { isInLibrary: false, hasAddableParts: false }, isAdding: false, onAdd: noop })),
      renderToStaticMarkup(createElement(MediaDetailModal, { media: media({ siteUrl }), open: true, onClose: noop, onEdit: noop, onDelete: noop, onToggleFavorite: noop, onIncrementProgress: noop, onComplete: noop })),
      renderToStaticMarkup(createElement(MediaModal, { editingItem: media({ siteUrl }), isOpen: true, onClose: noop, onSave: noop })),
    ];
    for (const html of outputs) {
      expect(html).toContain("TVMaze");
      expectLink(html, expected);
      expect(html).not.toMatch(/href="(?:javascript:|data:|https:\/\/evil)/);
    }
  });
  it("uses show provenance priority and never treats an episode ID as a show ID", () => {
    expect(tvmazeReleaseSourceUrl(event(), media({ siteUrl: slug }))).toBe(slug);
    expect(tvmazeReleaseSourceUrl(event(), media({ siteUrl: "https://evil.example" }))).toBe("https://www.tvmaze.com/shows/456");
    expect(tvmazeReleaseSourceUrl(event({ seasonIdentity: undefined }), media({ siteUrl: undefined, externalId: "123-season-2" }))).toBe(fallback);
    expect(tvmazeReleaseSourceUrl(event({ seasonIdentity: undefined }), media({ siteUrl: undefined, externalId: "invalid" }))).toBeUndefined();
  });
  it.each(["manual", "anilist", "tmdb"] as const)("does not add a source link to %s events", (provider) => {
    const origin: ReleaseEvent["origin"] = provider === "manual"
      ? { kind: "manual", persistence: "persistent_user_data" }
      : { kind: "provider", provider, providerEventId: "999", persistence: "reproducible_cache" };
    expect(tvmazeReleaseSourceUrl(event({ origin }), media())).toBeUndefined();
  });
  it.each([false, true])("renders calendar attribution outside the detail button (manual=%s)", (manual) => {
    const item = media({ siteUrl: undefined });
    const release = manual ? event({ origin: { kind: "manual", persistence: "persistent_user_data" } }) : event();
    const items = [{ media: item, event: release, stale: false, fetchedAt: "2026-10-05T00:00:00.000Z" }];
    const html = renderToStaticMarkup(createElement(ReleaseCalendarPanel, {
      releases: { items, hiddenItems: [], agenda: buildReleaseAgendaFromViewItems({ items, today: "2026-10-05" }), today: "2026-10-05", loading: false, refreshing: false, stale: false, partialError: false, failures: [], refresh: async () => {} },
      mediaList: [item], libraryReady: true, onOpen: noop, onSave: () => true, onConfirm: noop,
    }));
    if (manual) { expect(html).toContain("Manuel"); expect(html).not.toContain('href="https://www.tvmaze.com/'); }
    else expectLink(html, "https://www.tvmaze.com/shows/456");
    expect(html).not.toMatch(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<a\b/);
    expect(html).not.toContain("https://www.tvmaze.com/shows/999");
  });
  it.each(["123-season-2", "javascript:bad", "123-season-invalid"])("renders public favorites/current credit for %s", (externalId) => {
    const snapshot = { title: "Example", mediaType: "tv" as const, externalSource: "tvmaze", externalId, world: "screen" as const, sortOrder: 0 };
    const payload = {
      profile: { id: "owner" }, relationship: { self: false }, favorites: [snapshot], current: [snapshot], sharedNotes: [],
      modules: ["favorites", "current"].map((moduleKey, index) => ({ moduleKey, enabled: true, gridX: 0, gridY: index, gridWidth: 6, gridHeight: 1, visibility: "public" })),
    } as unknown as SocialProfilePayload;
    const html = renderToStaticMarkup(createElement(ProfileGrid, { payload }));
    expect(html.match(/>TVMaze</g)).toHaveLength(2);
    if (externalId === "123-season-2") expectLink(html, fallback);
    else expect(html).not.toContain('<a ');
  });
});

describe("TVMaze Portable Backup v3 provenance", () => {
  it.each([slug, undefined, "javascript:alert(1)", "https://evil.example"])("round trips safe URL %s without mutating input", async (siteUrl) => {
    const original = media({ siteUrl });
    const preimage = JSON.stringify(original);
    const source = { ownerType: "guest" as const, mediaItems: [original], progressLogs: [], identityAliases: { version: 1 as const, records: [], issues: [] }, recordRedirects: { version: 1 as const, records: [] }, recommendationLinks: [] };
    const options = { exportedAt: "2026-10-05T00:00:00.000Z", includePersonalNotes: false };
    const first = await createPortableBackup(source, options);
    const second = await createPortableBackup(source, options);
    expect(PORTABLE_BACKUP_VERSION).toBe(3);
    expect(first.backup.manifest.version).toBe(3);
    expect(first.serialized).toBe(second.serialized);
    expect(first.backup.data.mediaItems![0].siteUrl).toBe(siteUrl === slug ? slug : fallback);
    expect(JSON.stringify(original)).toBe(preimage);
    expect((await inspectPortableBackupText(first.serialized)).status).toBe("valid");
    const decoded = await decodePortableBackupForImport(first.serialized);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.data.mediaItems![0].siteUrl).toBe(siteUrl === slug ? slug : fallback);
  });
});
