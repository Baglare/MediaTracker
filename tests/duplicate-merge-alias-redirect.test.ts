import { describe, expect, it } from "vitest";

import {
  buildMergedIdentityAliases,
  emptyMediaIdentityAliasRegistry,
  resolveCanonicalMediaAlias,
  updateMediaIdentityAliases,
} from "@/lib/media-identity-aliases";
import { ensureMediaIdentity } from "@/lib/media-identity";
import {
  buildMergedRecordRedirects,
  emptyMediaRecordRedirectRegistry,
  mediaRecordRedirectRegistryCodec,
  resolveMediaRecordRedirect,
} from "@/lib/media-record-redirects";
import type { MediaItem } from "@/lib/types";

function media(id: string, source: "tmdb" | "omdb", externalId: string): MediaItem {
  return ensureMediaIdentity({
    id,
    title: "Example",
    type: "movie",
    status: "planning",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 1,
    favorite: false,
    externalSource: source,
    externalId,
  }).item;
}

describe("merge identity aliases", () => {
  it("flattens losing V2, legacy, record and existing aliases directly to survivor identity", () => {
    const survivor = media("survivor", "tmdb", "42");
    const losing = media("losing", "omdb", "tt0000042");
    const current = updateMediaIdentityAliases(
      emptyMediaIdentityAliasRegistry(),
      [{
        alias: "old-provider-alias",
        canonicalKey: losing.identity!.key,
        aliasType: "previous-provider-key",
        createdAt: "2026-07-28T00:00:00.000Z",
      }],
    ).registry;
    const result = buildMergedIdentityAliases({
      current,
      selectedItems: [survivor, losing],
      canonicalKey: survivor.identity!.key,
      createdAt: "2026-07-28T01:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveCanonicalMediaAlias(result.registry, losing.identity!.key))
      .toBe(survivor.identity!.key);
    expect(resolveCanonicalMediaAlias(result.registry, "losing"))
      .toBe(survivor.identity!.key);
    expect(resolveCanonicalMediaAlias(result.registry, "old-provider-alias"))
      .toBe(survivor.identity!.key);
    expect(result.registry.records.some((entry) =>
      result.registry.records.some((other) => other.alias === entry.canonicalKey)))
      .toBe(false);
  });

  it("does not overwrite an alias owned by an unrelated identity", () => {
    const survivor = media("survivor", "tmdb", "42");
    const losing = media("losing", "omdb", "tt0000042");
    const unrelated = media("unrelated", "tmdb", "99");
    const current = updateMediaIdentityAliases(
      emptyMediaIdentityAliasRegistry(),
      [{
        alias: "losing",
        canonicalKey: unrelated.identity!.key,
        aliasType: "record-id",
        createdAt: "2026-07-28T00:00:00.000Z",
      }],
    ).registry;
    expect(buildMergedIdentityAliases({
      current,
      selectedItems: [survivor, losing],
      canonicalKey: survivor.identity!.key,
    })).toMatchObject({ ok: false, code: "alias_collision" });
  });
});

describe("merge record redirects", () => {
  it("flattens prior redirects and creates direct losing-to-survivor mappings", () => {
    const current = {
      version: 1 as const,
      records: [{
        fromRecordId: "older-record",
        toRecordId: "losing",
        operationId: "old-operation",
        createdAt: "2026-07-28T00:00:00.000Z",
      }],
    };
    const result = buildMergedRecordRedirects({
      current,
      losingRecordIds: ["losing"],
      survivorRecordId: "survivor",
      operationId: "merge-operation",
      createdAt: "2026-07-28T01:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(resolveMediaRecordRedirect(result.registry, "older-record")).toBe("survivor");
    expect(resolveMediaRecordRedirect(result.registry, "losing")).toBe("survivor");
  });

  it("rejects collision, chain and cycle registries", () => {
    const collision = buildMergedRecordRedirects({
      current: {
        version: 1,
        records: [{
          fromRecordId: "losing",
          toRecordId: "unrelated",
          operationId: "old",
          createdAt: "2026-07-28T00:00:00.000Z",
        }],
      },
      losingRecordIds: ["losing"],
      survivorRecordId: "survivor",
      operationId: "new",
    });
    expect(collision).toMatchObject({ ok: false, code: "redirect_collision" });
    expect(mediaRecordRedirectRegistryCodec({
      version: 1,
      records: [
        {
          fromRecordId: "a",
          toRecordId: "b",
          operationId: "one",
          createdAt: "2026-07-28T00:00:00.000Z",
        },
        {
          fromRecordId: "b",
          toRecordId: "a",
          operationId: "two",
          createdAt: "2026-07-28T00:00:00.000Z",
        },
      ],
    })).toMatchObject({ ok: false });
    expect(emptyMediaRecordRedirectRegistry().records).toEqual([]);
  });
});
