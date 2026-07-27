import { describe, expect, it } from "vitest";

import {
  buildCanonicalMediaKeyV2,
  createManualMediaIdentity,
  decodeCanonicalMediaIdentity,
  ensureMediaIdentity,
  findExactIdentityCollisions,
  getCanonicalMediaKeyV2,
  getLegacyCanonicalMediaKey,
  parseCanonicalMediaKeyV2,
} from "@/lib/media-identity";
import {
  aliasesForMediaItems,
  emptyMediaIdentityAliasRegistry,
  mediaIdentityAliasRegistryCodec,
  readMediaIdentityAliasRegistry,
  resolveCanonicalMediaAlias,
  updateMediaIdentityAliases,
  writeMediaIdentityAliasRegistry,
} from "@/lib/media-identity-aliases";
import { decodeMediaItem, decodeMediaItems } from "@/lib/local-data-codec";
import { createUserOwnerScope } from "@/lib/local-owner-scope";
import type { PersonalStorageLike } from "@/lib/personal-data-storage";
import {
  canonicalMediaKey,
  mediaToSocialSnapshot,
} from "@/lib/social/interactions";
import { findMatchingLocalMedia } from "@/lib/social/local-social";
import type { MediaItem } from "@/lib/types";
import { buildSafeMediaState } from "@/lib/xp/progression";
import { fromMediaRow, toMediaRow } from "@/lib/supabase/mapping";
import { mergeImportedMediaItems } from "@/lib/backup";

class MemoryStorage implements PersonalStorageLike {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "record-1",
    title: "Example",
    type: "movie",
    theme: "screen",
    mediaType: "movie",
    subType: "movie",
    status: "planning",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    ...overrides,
  };
}

describe("Canonical Media Identity V2 key registry", () => {
  it.each([
    ["tmdb movie", media({ externalSource: "tmdb", externalId: "123", type: "movie" }), "v2:tmdb:movie:123"],
    ["tmdb tv", media({ externalSource: "tmdb", externalId: "123", type: "tv" }), "v2:tmdb:tv:123"],
    ["anilist anime", media({ externalSource: "anilist", externalId: "456", type: "anime" }), "v2:anilist:anime:456"],
    ["anilist manga", media({ externalSource: "anilist", externalId: "456", type: "manhwa" }), "v2:anilist:manga:456"],
    ["tvmaze show", media({ externalSource: "tvmaze", externalId: "789", type: "tv" }), "v2:tvmaze:show:789"],
    ["tvmaze season", media({ externalSource: "tvmaze", externalId: "789-season-2", type: "tv", seasonNumber: 2 }), "v2:tvmaze:season:789-season-2"],
    ["omdb title", media({ externalSource: "omdb", externalId: "TT0133093" }), "v2:omdb:title:tt0133093"],
    ["open library work", media({ externalSource: "openlibrary", externalId: "/works/ol45883w", type: "book" }), "v2:openlibrary:work:OL45883W"],
    ["open library edition", media({ externalSource: "openlibrary", externalId: "/books/ol7353617m", type: "book" }), "v2:openlibrary:edition:OL7353617M"],
  ])("derives %s deterministically", (_label, input, expected) => {
    const first = ensureMediaIdentity(input).item;
    const second = ensureMediaIdentity(input).item;
    expect(getCanonicalMediaKeyV2(first)).toBe(expected);
    expect(getCanonicalMediaKeyV2(second)).toBe(expected);
  });

  it("separates equal TMDB numeric IDs by namespace", () => {
    expect(buildCanonicalMediaKeyV2({ source: "tmdb", namespace: "movie", stableId: "42" }))
      .not.toBe(buildCanonicalMediaKeyV2({ source: "tmdb", namespace: "tv", stableId: "42" }));
  });

  it("keeps manual UUID stable across title and type edits", () => {
    const identity = createManualMediaIdentity("550e8400-e29b-41d4-a716-446655440000");
    const original = media({ identity });
    const edited = ensureMediaIdentity({ ...original, title: "Yeni Başlık", type: "book" }).item;
    expect(edited.identity).toEqual(identity);
  });

  it("uses locale-independent V2 keys while retaining the legacy Turkish alias", () => {
    const identity = createManualMediaIdentity("550e8400-e29b-41d4-a716-446655440000");
    const item = media({ title: "I İ ı i", identity });
    expect(getCanonicalMediaKeyV2(item)).toBe(
      "v2:manual:item:550e8400-e29b-41d4-a716-446655440000",
    );
    expect(getLegacyCanonicalMediaKey(item)).toBe(canonicalMediaKey(item));
  });

  it("rejects malformed sources, namespaces, IDs and unknown versions", () => {
    expect(buildCanonicalMediaKeyV2({
      source: "tmdb",
      namespace: "anime",
      stableId: "1",
    })).toBeNull();
    expect(parseCanonicalMediaKeyV2("v2:tmdb:movie:not-a-number")).toBeNull();
    expect(decodeCanonicalMediaIdentity({
      version: 99,
      key: "v99:tmdb:movie:1",
      source: "tmdb",
      namespace: "movie",
      externalId: "1",
    }).status).toBe("invalid");
  });

  it("repairs a mismatched persisted key from allowlisted fields", () => {
    const decoded = decodeCanonicalMediaIdentity({
      version: 2,
      key: "v2:tmdb:tv:123",
      source: "tmdb",
      namespace: "movie",
      externalId: "123",
    });
    expect(decoded).toMatchObject({
      status: "repairable",
      value: { key: "v2:tmdb:movie:123" },
      issue: { code: "IDENTITY_KEY_MISMATCH" },
    });
  });
});

describe("MediaItem identity codec and collision behavior", () => {
  it("accepts valid identity and repairs missing legacy identity", () => {
    const modern = ensureMediaIdentity(media({
      externalSource: "tmdb",
      externalId: "10",
    })).item;
    expect(decodeMediaItem(modern).status).toBe("valid");
    const legacy = decodeMediaItem(media({
      externalSource: "tmdb",
      externalId: "10",
    }));
    expect(legacy).toMatchObject({
      status: "repairable",
      value: { identity: { key: "v2:tmdb:movie:10" } },
    });
  });

  it("preserves an unknown-source record as unresolved instead of hiding it", () => {
    const decoded = decodeMediaItem({
      ...media(),
      externalSource: "future-provider",
      externalId: "abc",
    });
    expect(decoded.status).not.toBe("invalid");
    if (decoded.status === "invalid") return;
    expect(decoded.value).toMatchObject({
      id: "record-1",
      identityStatus: "unresolved",
      identityIssueCodes: ["IDENTITY_INVALID_SOURCE"],
    });
    expect(decoded.value.identity).toBeUndefined();
  });

  it("does not regenerate a malformed persisted manual UUID during hydration", () => {
    const decoded = decodeMediaItem({
      ...media(),
      identity: {
        version: 2,
        key: "v2:manual:item:not-a-uuid",
        source: "manual",
        namespace: "item",
        manualId: "not-a-uuid",
      },
    });
    expect(decoded.status).not.toBe("invalid");
    if (decoded.status === "invalid") return;
    expect(decoded.value.identity).toBeUndefined();
    expect(decoded.value).toMatchObject({
      identityStatus: "unresolved",
      identityIssueCodes: ["IDENTITY_UNRESOLVED"],
    });
  });

  it("keeps exact-collision records and reports both without merging", () => {
    const identity = ensureMediaIdentity(media({
      externalSource: "tmdb",
      externalId: "10",
    })).item.identity;
    const items = [media({ id: "a", identity }), media({ id: "b", identity })];
    const decoded = decodeMediaItems(items);
    expect(decoded.records).toHaveLength(2);
    expect(decoded.warnings.filter((entry) => entry.code === "IDENTITY_EXACT_COLLISION"))
      .toHaveLength(2);
    expect(findExactIdentityCollisions(items)).toHaveLength(2);
  });
});

describe("owner-scoped compatibility aliases", () => {
  it("resolves legacy canonical key and record ID directly to V2", () => {
    const item = ensureMediaIdentity(media({
      id: "record-42",
      externalSource: "tmdb",
      externalId: "42",
    })).item;
    const generated = aliasesForMediaItems([item], "2026-07-27T00:00:00.000Z");
    const registry = updateMediaIdentityAliases(
      emptyMediaIdentityAliasRegistry(),
      generated.records,
    ).registry;
    expect(resolveCanonicalMediaAlias(registry, "tmdb:42")).toBe("v2:tmdb:movie:42");
    expect(resolveCanonicalMediaAlias(registry, "record-42")).toBe("v2:tmdb:movie:42");
    expect(resolveCanonicalMediaAlias(registry, "v2:tmdb:movie:42"))
      .toBe("v2:tmdb:movie:42");
  });

  it("is idempotent and never overwrites an alias collision", () => {
    const first = {
      alias: "tmdb:42",
      canonicalKey: "v2:tmdb:movie:42",
      aliasType: "legacy-canonical-key" as const,
      createdAt: "2026-07-27T00:00:00.000Z",
    };
    const collision = { ...first, canonicalKey: "v2:tmdb:tv:42" };
    const once = updateMediaIdentityAliases(emptyMediaIdentityAliasRegistry(), [first]);
    const twice = updateMediaIdentityAliases(once.registry, [first, collision]);
    expect(twice.registry.records).toHaveLength(1);
    expect(twice.registry.records[0].canonicalKey).toBe("v2:tmdb:movie:42");
    expect(twice.issues).toMatchObject([{ code: "IDENTITY_ALIAS_COLLISION" }]);
  });

  it("rejects alias chains and isolates User A from User B", () => {
    expect(mediaIdentityAliasRegistryCodec({
      version: 1,
      records: [{
        alias: "old",
        canonicalKey: "another-alias",
        aliasType: "record-id",
        createdAt: "2026-07-27T00:00:00.000Z",
      }],
      issues: [],
    }).ok).toBe(false);

    const storage = new MemoryStorage();
    const userA = createUserOwnerScope("user-a");
    const userB = createUserOwnerScope("user-b");
    const registry = {
      version: 1 as const,
      records: [{
        alias: "tmdb:42",
        canonicalKey: "v2:tmdb:movie:42",
        aliasType: "legacy-canonical-key" as const,
        createdAt: "2026-07-27T00:00:00.000Z",
      }],
      issues: [],
    };
    expect(writeMediaIdentityAliasRegistry(userA, registry, storage).ok).toBe(true);
    expect(readMediaIdentityAliasRegistry(userA, storage).status).toBe("valid");
    expect(readMediaIdentityAliasRegistry(userB, storage).status).toBe("missing");
  });

  it("keeps recommendation lookup working through a legacy alias", () => {
    const item = ensureMediaIdentity(media({
      externalSource: "tmdb",
      externalId: "42",
    })).item;
    const generated = aliasesForMediaItems([item], "2026-07-27T00:00:00.000Z");
    const registry = updateMediaIdentityAliases(
      emptyMediaIdentityAliasRegistry(),
      generated.records,
    ).registry;
    expect(findMatchingLocalMedia(
      { canonicalKey: "tmdb:42" },
      [item],
      registry,
    )?.id).toBe(item.id);
    expect(mediaToSocialSnapshot(item).canonicalKey).toBe("tmdb:42");
  });
});

describe("XP and social legacy compatibility", () => {
  it("does not change entitlement, state hash or social key when V2 identity is added", () => {
    const legacy = media({
      externalSource: "tmdb",
      externalId: "42",
      status: "completed",
      currentProgress: 1,
    });
    const v2 = ensureMediaIdentity(legacy).item;
    expect(canonicalMediaKey(v2)).toBe(canonicalMediaKey(legacy));
    expect(buildSafeMediaState(v2)).toEqual(buildSafeMediaState(legacy));
    expect(mediaToSocialSnapshot(v2)).toEqual(mediaToSocialSnapshot(legacy));
  });
});

describe("cloud mapping compatibility", () => {
  const row = {
    id: "cloud-record",
    user_id: "user-a",
    title: "Cloud Movie",
    type: "movie",
    status: "planning",
    current_progress: 0,
    total_progress: 1,
    external_source: "tmdb",
    external_id: "42",
    cover_url: null,
    backdrop_url: null,
    overview: null,
    release_year: null,
    favorite: false,
    user_rating: null,
    tags: [],
    personal_notes: null,
    metadata: {},
    created_at: "2026-07-27T00:00:00.000Z",
    updated_at: "2026-07-27T00:00:00.000Z",
  } as Parameters<typeof fromMediaRow>[0];

  it("derives deterministic V2 identity on download", () => {
    expect(fromMediaRow(row).identity?.key).toBe("v2:tmdb:movie:42");
    expect(fromMediaRow(row).identity).toEqual(fromMediaRow(row).identity);
  });

  it("uses stable cloud record ID for external-less legacy downloads", () => {
    const legacy = { ...row, external_source: null, external_id: null };
    expect(fromMediaRow(legacy).identity?.key).toBe("v2:legacy:record:cloud-record");
    expect(fromMediaRow(legacy).identity).toEqual(fromMediaRow(legacy).identity);
  });

  it("does not add unknown cloud columns or private identity metadata on upload", () => {
    const item = fromMediaRow(row);
    const upload = toMediaRow("user-a", item) as Record<string, unknown>;
    expect(upload).not.toHaveProperty("identity");
    expect(upload.metadata).not.toHaveProperty("identity");
    expect(upload.metadata).not.toHaveProperty("identityIssueCodes");
  });
});

describe("backup/import identity compatibility", () => {
  it("preserves a valid manual identity when a conflicting record ID is rewritten", () => {
    const current = media({
      id: "same-record",
      identity: createManualMediaIdentity("550e8400-e29b-41d4-a716-446655440000"),
    });
    const importedIdentity = createManualMediaIdentity(
      "550e8400-e29b-41d4-a716-446655440001",
    );
    const imported = media({
      id: "same-record",
      title: "Imported",
      identity: importedIdentity,
    });
    const result = mergeImportedMediaItems([current], [imported]);
    expect(result.items).toHaveLength(2);
    expect(result.items?.[1].id).not.toBe("same-record");
    expect(result.items?.[1].identity).toEqual(importedIdentity);
  });
});
