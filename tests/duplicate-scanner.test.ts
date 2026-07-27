import { describe, expect, it } from "vitest";

import {
  buildDuplicateCandidateFingerprint,
  buildDuplicateEvidence,
  buildDuplicateMergePreview,
  classifyDuplicateGroup,
  normalizeDuplicateTitle,
  scanDuplicateCandidates,
  summarizeDuplicateCandidate,
} from "@/lib/duplicate-scanner";
import {
  emptyMediaIdentityAliasRegistry,
  updateMediaIdentityAliases,
  type MediaIdentityAliasRecord,
} from "@/lib/media-identity-aliases";
import {
  createCanonicalMediaIdentity,
  createManualMediaIdentity,
  ensureMediaIdentity,
} from "@/lib/media-identity";
import { mediaToSocialSnapshot } from "@/lib/social/interactions";
import { toMediaRow } from "@/lib/supabase/mapping";
import type { MediaItem, ProgressLog } from "@/lib/types";
import { buildSafeMediaState } from "@/lib/xp/progression";

function media(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: "record-1",
    title: "Example",
    type: "movie",
    status: "planning",
    coverImage: "/cover.jpg",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    ...overrides,
  };
}

function identified(overrides: Partial<MediaItem> = {}): MediaItem {
  return ensureMediaIdentity(media(overrides)).item;
}

const aliases = emptyMediaIdentityAliasRegistry();
const ownerScope = "user:user-a";

function scan(items: MediaItem[], registry = aliases) {
  return scanDuplicateCandidates(items, registry, { ownerScope });
}

describe("duplicate title normalization", () => {
  it("normalizes Unicode, case, punctuation and repeated whitespace deterministically", () => {
    expect(normalizeDuplicateTitle("  DUNE:  PART—ONE! ")).toBe("dune part one");
    expect(normalizeDuplicateTitle("I")).toBe("i");
  });

  it("does not transliterate different alphabets or remove part numbers", () => {
    expect(normalizeDuplicateTitle("Frieren")).not.toBe(normalizeDuplicateTitle("葬送のフリーレン"));
    expect(normalizeDuplicateTitle("Film Part 1")).not.toBe(normalizeDuplicateTitle("Film Part 2"));
  });
});

describe("exact duplicate scan", () => {
  it("groups two records with the same valid V2 key without mutating them", () => {
    const first = identified({ id: "a", externalSource: "tmdb", externalId: "42" });
    const second = { ...first, id: "b", title: "Renamed" };
    const before = JSON.stringify([first, second]);
    const result = scan([first, second]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      classification: "exact",
      recordIds: ["a", "b"],
      confidence: 1,
      ownerScope,
    });
    expect(result.candidates[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "EXACT_CANONICAL_IDENTITY" }),
    ]));
    expect(JSON.stringify([first, second])).toBe(before);
  });

  it("groups three equal identities once and remains record-order independent", () => {
    const identity = createCanonicalMediaIdentity({
      source: "anilist",
      namespace: "anime",
      stableId: "99",
    })!;
    const items = [
      media({ id: "c", type: "anime", identity }),
      media({ id: "a", type: "anime", identity }),
      media({ id: "b", type: "anime", identity }),
    ];
    const first = scan(items).candidates[0];
    const second = scan([...items].reverse()).candidates[0];
    expect(first.recordIds).toEqual(["a", "b", "c"]);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.evidenceFingerprint).toBe(second.evidenceFingerprint);
  });

  it("treats an equal manual UUID as exact", () => {
    const identity = createManualMediaIdentity("550e8400-e29b-41d4-a716-446655440000");
    const candidate = scan([
      media({ id: "a", identity }),
      media({ id: "b", identity }),
    ]).candidates[0];
    expect(candidate.classification).toBe("exact");
    expect(candidate.evidence.map((entry) => entry.code)).toContain("MANUAL_IDENTITY_MATCH");
  });

  it("does not treat invalid identity or equal numeric IDs in different namespaces as exact", () => {
    const invalid = {
      version: 2,
      key: "v2:tmdb:movie:bad",
      source: "tmdb",
      namespace: "movie",
      externalId: "bad",
    } as MediaItem["identity"];
    const invalidResult = scan([
      media({ id: "a", identity: invalid }),
      media({ id: "b", identity: invalid }),
    ]);
    expect(invalidResult.candidates.some((entry) => entry.classification === "exact")).toBe(false);
    expect(invalidResult.candidates[0].classification).toBe("probable");

    const movie = identified({
      id: "movie",
      type: "movie",
      title: "Adaptation",
      externalSource: "tmdb",
      externalId: "42",
    });
    const tv = identified({
      id: "tv",
      type: "tv",
      title: "Adaptation",
      externalSource: "tmdb",
      externalId: "42",
    });
    expect(scan([movie, tv]).candidates).toHaveLength(0);
    expect(scan([movie, tv]).suppressed[0].reason).toBe("type_conflict");
  });
});

describe("strong cross-source candidates", () => {
  it("uses a verified IMDb bridge without changing canonical identity", () => {
    const tmdb = identified({
      id: "tmdb",
      title: "The Matrix",
      externalSource: "tmdb",
      externalId: "603",
      imdbId: "tt0133093",
    });
    const omdb = identified({
      id: "omdb",
      title: "Matrix, The",
      externalSource: "omdb",
      externalId: "tt0133093",
    });
    const candidate = scan([tmdb, omdb]).candidates[0];
    expect(candidate.classification).toBe("strong");
    expect(candidate.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "VERIFIED_EXTERNAL_ID_MATCH" }),
    ]));
    expect(tmdb.identity?.key).not.toBe(omdb.identity?.key);
  });

  it("uses a verified ISBN match as strong evidence", () => {
    const work = identified({
      id: "work",
      type: "book",
      title: "Book",
      externalSource: "openlibrary",
      externalId: "OL1W",
      isbn: ["978-0-306-40615-7"],
    });
    const manual = identified({
      id: "manual",
      type: "book",
      title: "Different catalog title",
      isbn: ["9780306406157"],
    });
    expect(scan([work, manual]).candidates[0].classification).toBe("strong");
  });

  it("uses a collision-free compatibility alias but never promotes a collided alias", () => {
    const tmdb = identified({
      id: "tmdb",
      externalSource: "tmdb",
      externalId: "603",
    });
    const omdb = identified({
      id: "omdb",
      title: "Different",
      externalSource: "omdb",
      externalId: "tt0133093",
    });
    const bridge: MediaIdentityAliasRecord = {
      alias: "omdb:tt0133093",
      canonicalKey: tmdb.identity!.key,
      aliasType: "previous-provider-key",
      createdAt: "2026-07-28T00:00:00.000Z",
    };
    const registry = updateMediaIdentityAliases(aliases, [bridge]).registry;
    expect(scan([tmdb, omdb], registry).candidates[0].classification).toBe("strong");

    const collision = updateMediaIdentityAliases(registry, [{
      ...bridge,
      canonicalKey: "v2:tmdb:movie:604",
    }]).registry;
    expect(scan([tmdb, omdb], collision).candidates).toHaveLength(0);
  });

  it("supports record aliases but does not invent an unverified provider bridge", () => {
    const target = identified({
      id: "new-record",
      title: "Target",
      externalSource: "tmdb",
      externalId: "10",
    });
    const legacy = identified({ id: "old-record", title: "Legacy" });
    const registry = updateMediaIdentityAliases(aliases, [{
      alias: "old-record",
      canonicalKey: target.identity!.key,
      aliasType: "record-id",
      createdAt: "2026-07-28T00:00:00.000Z",
    }]).registry;
    const candidate = scan([target, legacy], registry).candidates[0];
    expect(candidate.classification).toBe("strong");
    expect(candidate.evidence.map((entry) => entry.code)).toContain("RECORD_ALIAS_MATCH");

    const crossSource = scan([
      identified({ id: "a", title: "Same", externalSource: "tmdb", externalId: "1" }),
      identified({ id: "b", title: "Same", externalSource: "omdb", externalId: "tt00001" }),
    ]).candidates[0];
    expect(crossSource.classification).toBe("probable");
  });
});

describe("probable candidates and false-positive suppression", () => {
  it("uses title, type and year with stable explanatory evidence", () => {
    const candidate = scan([
      identified({ id: "a", title: "Spider-Man", releaseYear: 2002 }),
      identified({ id: "b", title: " spider man ", releaseYear: 2002 }),
    ]).candidates[0];
    expect(candidate.classification).toBe("probable");
    expect(candidate.evidence.map((entry) => entry.code)).toEqual(expect.arrayContaining([
      "NORMALIZED_TITLE_MATCH",
      "MEDIA_TYPE_MATCH",
      "RELEASE_YEAR_MATCH",
    ]));
    expect(summarizeDuplicateCandidate(candidate).label).toBe("Olası aday");
  });

  it("accepts missing year and a trusted alternative/native title as probable", () => {
    const missingYear = scan([
      identified({ id: "a", title: "Dune", releaseYear: 2021 }),
      identified({ id: "b", title: "DUNE" }),
    ]).candidates[0];
    expect(missingYear.classification).toBe("probable");

    const alternative = scan([
      identified({ id: "c", type: "anime", title: "Frieren", nativeTitle: "葬送のフリーレン" }),
      identified({ id: "d", type: "anime", title: "葬送のフリーレン" }),
    ]).candidates[0];
    expect(alternative.evidence.map((entry) => entry.code)).toContain("ALTERNATIVE_TITLE_MATCH");
  });

  it.each([
    ["different years/remake", media({ id: "a", title: "Dune", releaseYear: 1984 }), media({ id: "b", title: "Dune", releaseYear: 2021 }), "year_conflict"],
    ["movie and TV", media({ id: "a", title: "Fargo", type: "movie" }), media({ id: "b", title: "Fargo", type: "tv" }), "type_conflict"],
    ["anime and manga", media({ id: "a", title: "Monster", type: "anime" }), media({ id: "b", title: "Monster", type: "manga" }), "type_conflict"],
    ["manual same title different type", media({ id: "a", title: "Foundation", type: "book" }), media({ id: "b", title: "Foundation", type: "tv" }), "type_conflict"],
  ])("suppresses %s", (_label, left, right, reason) => {
    const result = scan([identified(left), identified(right)]);
    expect(result.candidates).toHaveLength(0);
    expect(result.suppressed[0].reason).toBe(reason);
  });

  it("suppresses show/season and same-source namespace conflicts", () => {
    const show = identified({
      id: "show",
      title: "Show",
      type: "tv",
      externalSource: "tvmaze",
      externalId: "5",
      seriesGroupId: "tvmaze:5",
      seriesRelationType: "main",
    });
    const season = identified({
      id: "season",
      title: "Show",
      type: "tv",
      externalSource: "tvmaze",
      externalId: "5-season-1",
      seriesGroupId: "tvmaze:5",
      seriesRelationType: "season",
      seasonNumber: 1,
    });
    expect(scan([show, season]).suppressed[0].reason).toBe("namespace_conflict");
  });

  it("does not create candidates from cover, genre or description alone", () => {
    const result = scan([
      identified({
        id: "a",
        title: "First",
        coverImage: "https://cdn/cover.jpg",
        genres: ["Drama"],
        overview: "Same description",
      }),
      identified({
        id: "b",
        title: "Second",
        coverImage: "https://cdn/cover.jpg",
        genres: ["Drama"],
        overview: "Same description",
      }),
    ]);
    expect(result.candidates).toHaveLength(0);
    expect(result.suppressed).toHaveLength(0);
  });

  it("keeps different volumes and Part 1/Part 2 separate", () => {
    expect(scan([
      identified({ id: "a", type: "book", title: "Saga Vol. 1" }),
      identified({ id: "b", type: "book", title: "Saga Vol. 2" }),
      identified({ id: "c", title: "Movie Part 1" }),
      identified({ id: "d", title: "Movie Part 2" }),
    ]).candidates).toHaveLength(0);
  });
});

describe("grouping, fingerprint and read-only preview", () => {
  it("collapses repeated probable pairs into one three-record group", () => {
    const candidate = scan([
      identified({ id: "c", title: "Same", releaseYear: 2020 }),
      identified({ id: "a", title: "Same", releaseYear: 2020 }),
      identified({ id: "b", title: "Same", releaseYear: 2020 }),
    ]).candidates[0];
    expect(candidate.classification).toBe("probable");
    expect(candidate.recordIds).toEqual(["a", "b", "c"]);
  });

  it("changes fingerprint when evidence changes", () => {
    const first = scan([
      identified({ id: "a", title: "Same" }),
      identified({ id: "b", title: "Same" }),
    ]).candidates[0];
    const second = scan([
      identified({ id: "a", title: "Same", releaseYear: 2020 }),
      identified({ id: "b", title: "Same", releaseYear: 2020 }),
    ]).candidates[0];
    expect(first.fingerprint).not.toBe(second.fingerprint);
    expect(first.evidenceFingerprint).not.toBe(second.evidenceFingerprint);
  });

  it("builds a deterministic fingerprint independent of input order", () => {
    const evidence = buildDuplicateEvidence(
      identified({ id: "a", title: "Same" }),
      identified({ id: "b", title: "Same" }),
      aliases,
    );
    expect(buildDuplicateCandidateFingerprint({
      classification: "probable",
      recordIds: ["a", "b"],
      evidence,
    })).toEqual(buildDuplicateCandidateFingerprint({
      classification: "probable",
      recordIds: ["b", "a"],
      evidence: [...evidence].reverse(),
    }));
    expect(classifyDuplicateGroup(evidence).classification).toBe("probable");
  });

  it("previews logs, groups and legacy XP keys without changing any domain state", () => {
    const first = identified({
      id: "a",
      title: "Same",
      seriesGroupId: "group-1",
      seriesGroupTitle: "Group",
    });
    const second = identified({ id: "b", title: "Same" });
    const logs: ProgressLog[] = [{
      id: "log-1",
      mediaId: "a",
      mediaTitle: "Same",
      mediaType: "movie",
      action: "added",
      amount: 0,
      unit: "movie",
      previousProgress: 0,
      newProgress: 0,
      createdAt: "2026-07-28T00:00:00.000Z",
    }];
    const candidate = scan([first, second]).candidates[0];
    const before = JSON.stringify({ items: [first, second], logs, aliases });
    const preview = buildDuplicateMergePreview(candidate, [first, second], logs);
    expect(preview).toMatchObject({
      recordIds: ["a", "b"],
      blockedReasons: ["MERGE_EXECUTOR_NOT_AVAILABLE", "SURVIVOR_NOT_SELECTED"],
      relationships: {
        progressLogCounts: { a: 1, b: 0 },
        groupMemberships: { a: ["group-1", "Group"], b: [] },
      },
    });
    expect(JSON.stringify({ items: [first, second], logs, aliases })).toBe(before);
  });

  it("does not change XP, social or cloud projections while scanning", () => {
    const first = identified({
      id: "a",
      title: "Same",
      externalSource: "tmdb",
      externalId: "42",
    });
    const second = { ...first, id: "b" };
    const before = {
      xp: buildSafeMediaState(first),
      social: mediaToSocialSnapshot(first),
      cloud: toMediaRow("user-a", first),
    };
    scan([first, second]);
    expect(buildSafeMediaState(first)).toEqual(before.xp);
    expect(mediaToSocialSnapshot(first)).toEqual(before.social);
    expect(toMediaRow("user-a", first)).toEqual(before.cloud);
  });
});
