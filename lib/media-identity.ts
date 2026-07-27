import type { MediaItem, MediaSource, MediaType } from "./types";

export const CANONICAL_MEDIA_IDENTITY_VERSION = 2 as const;

export const MEDIA_IDENTITY_SOURCE_NAMESPACES = {
  tmdb: ["movie", "tv"],
  anilist: ["anime", "manga"],
  tvmaze: ["show", "season"],
  omdb: ["title"],
  openlibrary: ["work", "edition"],
  manual: ["item"],
  legacy: ["record"],
} as const;

export type CanonicalMediaSource = keyof typeof MEDIA_IDENTITY_SOURCE_NAMESPACES;
export type CanonicalMediaNamespace =
  (typeof MEDIA_IDENTITY_SOURCE_NAMESPACES)[CanonicalMediaSource][number];

export interface CanonicalMediaIdentityV2 {
  version: 2;
  key: string;
  source: CanonicalMediaSource;
  namespace: CanonicalMediaNamespace;
  externalId?: string;
  manualId?: string;
}

export type MediaIdentityMigrationSource =
  | "native"
  | "legacy-derived"
  | "manual-generated";

export interface MediaIdentityMetadata {
  aliases: string[];
  migrationSource?: MediaIdentityMigrationSource;
}

export type MediaIdentityIssueCode =
  | "IDENTITY_MISSING"
  | "IDENTITY_UNRESOLVED"
  | "IDENTITY_INVALID_SOURCE"
  | "IDENTITY_INVALID_NAMESPACE"
  | "IDENTITY_KEY_MISMATCH"
  | "IDENTITY_ALIAS_COLLISION"
  | "IDENTITY_EXACT_COLLISION"
  | "MANUAL_ID_MISSING"
  | "MANUAL_ID_REGENERATED";

const MEDIA_IDENTITY_ISSUE_CODE_SET = new Set<MediaIdentityIssueCode>([
  "IDENTITY_MISSING",
  "IDENTITY_UNRESOLVED",
  "IDENTITY_INVALID_SOURCE",
  "IDENTITY_INVALID_NAMESPACE",
  "IDENTITY_KEY_MISMATCH",
  "IDENTITY_ALIAS_COLLISION",
  "IDENTITY_EXACT_COLLISION",
  "MANUAL_ID_MISSING",
  "MANUAL_ID_REGENERATED",
]);

export function isMediaIdentityIssueCode(value: unknown): value is MediaIdentityIssueCode {
  return typeof value === "string"
    && MEDIA_IDENTITY_ISSUE_CODE_SET.has(value as MediaIdentityIssueCode);
}

export interface MediaIdentityIssue {
  id: string;
  code: MediaIdentityIssueCode;
  severity: "warning" | "error";
  recordId?: string;
  currentIdentity?: string;
  expectedIdentity?: string;
  repairable: boolean;
  evidence: string;
}

export type CanonicalIdentityDecodeResult =
  | { status: "valid"; value: CanonicalMediaIdentityV2 }
  | {
      status: "repairable";
      value: CanonicalMediaIdentityV2;
      issue: MediaIdentityIssue;
    }
  | { status: "invalid"; issue: MediaIdentityIssue };

type IdentitySeed = Pick<
  MediaItem,
  "id" | "type" | "externalSource" | "externalId" | "seasonNumber"
>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const TVMAZE_SEASON_PATTERN = /^([1-9]\d*)-season-([1-9]\d*)$/i;
const OMDB_IMDB_PATTERN = /^tt\d{5,12}$/i;
const OPEN_LIBRARY_WORK_PATTERN = /^(?:\/?works\/)?(OL\d+W)$/i;
const OPEN_LIBRARY_EDITION_PATTERN = /^(?:\/?(?:books|editions)\/)?(OL\d+M)$/i;

function issue(
  code: MediaIdentityIssueCode,
  evidence: string,
  options: Partial<Omit<MediaIdentityIssue, "id" | "code" | "evidence">> = {},
): MediaIdentityIssue {
  const recordId = options.recordId ?? "";
  const expected = options.expectedIdentity ?? "";
  return {
    id: `identity:${code}:${recordId}:${expected}`,
    code,
    severity: options.severity ?? "error",
    repairable: options.repairable ?? false,
    evidence,
    ...options,
  };
}

function isNamespaceAllowed(
  source: CanonicalMediaSource,
  namespace: string,
): namespace is CanonicalMediaNamespace {
  return (MEDIA_IDENTITY_SOURCE_NAMESPACES[source] as readonly string[]).includes(namespace);
}

function normalizePositiveInteger(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const normalized = trimmed.replace(/^0+(?=\d)/, "");
  return POSITIVE_INTEGER_PATTERN.test(normalized) ? normalized : null;
}

function normalizeStableId(
  source: CanonicalMediaSource,
  namespace: CanonicalMediaNamespace,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes(":")) return null;
  if (source === "tmdb" || source === "anilist") {
    return normalizePositiveInteger(trimmed);
  }
  if (source === "tvmaze" && namespace === "show") {
    return normalizePositiveInteger(trimmed);
  }
  if (source === "tvmaze" && namespace === "season") {
    const match = trimmed.match(TVMAZE_SEASON_PATTERN);
    if (!match) return null;
    return `${match[1]}-season-${match[2]}`;
  }
  if (source === "omdb") {
    return OMDB_IMDB_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
  }
  if (source === "openlibrary" && namespace === "work") {
    return trimmed.match(OPEN_LIBRARY_WORK_PATTERN)?.[1]?.toUpperCase() ?? null;
  }
  if (source === "openlibrary" && namespace === "edition") {
    return trimmed.match(OPEN_LIBRARY_EDITION_PATTERN)?.[1]?.toUpperCase() ?? null;
  }
  if (source === "manual") {
    return UUID_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
  }
  if (source === "legacy") {
    if (trimmed.length > 240) return null;
    try {
      return encodeURIComponent(decodeURIComponent(trimmed));
    } catch {
      return encodeURIComponent(trimmed);
    }
  }
  return null;
}

export function buildCanonicalMediaKeyV2(args: {
  source: CanonicalMediaSource;
  namespace: CanonicalMediaNamespace;
  stableId: string;
}): string | null {
  if (!isNamespaceAllowed(args.source, args.namespace)) return null;
  const stableId = normalizeStableId(args.source, args.namespace, args.stableId);
  return stableId ? `v2:${args.source}:${args.namespace}:${stableId}` : null;
}

export function createCanonicalMediaIdentity(args: {
  source: CanonicalMediaSource;
  namespace: CanonicalMediaNamespace;
  stableId: string;
}): CanonicalMediaIdentityV2 | null {
  const key = buildCanonicalMediaKeyV2(args);
  if (!key) return null;
  const stableId = key.split(":").slice(3).join(":");
  return {
    version: CANONICAL_MEDIA_IDENTITY_VERSION,
    key,
    source: args.source,
    namespace: args.namespace,
    ...(args.source === "manual"
      ? { manualId: stableId }
      : { externalId: stableId }),
  };
}

export function parseCanonicalMediaKeyV2(
  key: string,
): CanonicalMediaIdentityV2 | null {
  const parts = key.trim().split(":");
  if (parts.length !== 4 || parts[0] !== "v2") return null;
  const source = parts[1];
  if (!(source in MEDIA_IDENTITY_SOURCE_NAMESPACES)) return null;
  const canonicalSource = source as CanonicalMediaSource;
  const namespace = parts[2];
  if (!isNamespaceAllowed(canonicalSource, namespace)) return null;
  return createCanonicalMediaIdentity({
    source: canonicalSource,
    namespace,
    stableId: parts[3],
  });
}

export function decodeCanonicalMediaIdentity(
  value: unknown,
  recordId?: string,
): CanonicalIdentityDecodeResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      status: "invalid",
      issue: issue("IDENTITY_MISSING", "Canonical identity bir obje olmalidir.", {
        recordId,
        repairable: true,
      }),
    };
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== CANONICAL_MEDIA_IDENTITY_VERSION) {
    return {
      status: "invalid",
      issue: issue("IDENTITY_UNRESOLVED", "Canonical identity version desteklenmiyor.", {
        recordId,
      }),
    };
  }
  if (
    typeof raw.source !== "string"
    || !(raw.source in MEDIA_IDENTITY_SOURCE_NAMESPACES)
  ) {
    return {
      status: "invalid",
      issue: issue("IDENTITY_INVALID_SOURCE", "Canonical identity source allowlist disinda.", {
        recordId,
      }),
    };
  }
  const source = raw.source as CanonicalMediaSource;
  if (typeof raw.namespace !== "string" || !isNamespaceAllowed(source, raw.namespace)) {
    return {
      status: "invalid",
      issue: issue("IDENTITY_INVALID_NAMESPACE", "Source ve namespace kombinasyonu gecersiz.", {
        recordId,
      }),
    };
  }
  const namespace = raw.namespace;
  const rawStableId = source === "manual" ? raw.manualId : raw.externalId;
  if (typeof rawStableId !== "string") {
    return {
      status: "invalid",
      issue: issue(
        source === "manual" ? "MANUAL_ID_MISSING" : "IDENTITY_UNRESOLVED",
        "Canonical identity stabil kimlik alani eksik.",
        { recordId, repairable: source === "manual" },
      ),
    };
  }
  const identity = createCanonicalMediaIdentity({
    source,
    namespace,
    stableId: rawStableId,
  });
  if (!identity) {
    return {
      status: "invalid",
      issue: issue("IDENTITY_UNRESOLVED", "Canonical identity stabil kimligi gecersiz.", {
        recordId,
      }),
    };
  }
  if (raw.key !== identity.key) {
    return {
      status: "repairable",
      value: identity,
      issue: issue("IDENTITY_KEY_MISMATCH", "Persisted key alanlardan yeniden uretildi.", {
        recordId,
        currentIdentity: typeof raw.key === "string" ? raw.key : undefined,
        expectedIdentity: identity.key,
        repairable: true,
        severity: "warning",
      }),
    };
  }
  return { status: "valid", value: identity };
}

export function generateManualMediaId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID().toLowerCase();
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error("secure_manual_media_id_unavailable");
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (entry) => entry.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function createManualMediaIdentity(
  manualId = generateManualMediaId(),
): CanonicalMediaIdentityV2 {
  const identity = createCanonicalMediaIdentity({
    source: "manual",
    namespace: "item",
    stableId: manualId,
  });
  if (!identity) throw new Error("invalid_manual_media_id");
  return identity;
}

export function createLegacyRecordIdentity(recordId: string): CanonicalMediaIdentityV2 | null {
  return createCanonicalMediaIdentity({
    source: "legacy",
    namespace: "record",
    stableId: recordId,
  });
}

function namespaceForExternalMedia(
  source: Exclude<MediaSource, "manual">,
  type: MediaType,
  externalId: string,
  seasonNumber?: number,
): { namespace: CanonicalMediaNamespace; stableId: string } | null {
  if (source === "tmdb") {
    if (type !== "movie" && type !== "tv") return null;
    return { namespace: type, stableId: externalId };
  }
  if (source === "anilist") {
    if (type === "anime") return { namespace: "anime", stableId: externalId };
    if (["manga", "manhwa", "manhua", "light_novel", "web_novel"].includes(type)) {
      return { namespace: "manga", stableId: externalId };
    }
    return null;
  }
  if (source === "tvmaze") {
    const season = externalId.match(TVMAZE_SEASON_PATTERN);
    if (season || typeof seasonNumber === "number") {
      const stableId = season
        ? externalId
        : `${externalId}-season-${seasonNumber}`;
      return { namespace: "season", stableId };
    }
    return { namespace: "show", stableId: externalId };
  }
  if (source === "omdb") return { namespace: "title", stableId: externalId };
  if (source === "openlibrary") {
    if (OPEN_LIBRARY_WORK_PATTERN.test(externalId)) {
      return { namespace: "work", stableId: externalId };
    }
    if (OPEN_LIBRARY_EDITION_PATTERN.test(externalId)) {
      return { namespace: "edition", stableId: externalId };
    }
  }
  return null;
}

export function deriveCanonicalMediaIdentity(
  media: IdentitySeed,
  options: {
    manualIdFactory?: () => string;
    legacyRecordId?: string;
  } = {},
): { identity?: CanonicalMediaIdentityV2; issues: MediaIdentityIssue[] } {
  if (options.legacyRecordId) {
    const identity = createLegacyRecordIdentity(options.legacyRecordId);
    return identity
      ? { identity, issues: [] }
      : {
          issues: [issue("IDENTITY_UNRESOLVED", "Legacy record id V2 identity icin kullanilamadi.", {
            recordId: media.id,
          })],
        };
  }
  if (!media.externalSource || media.externalSource === "manual") {
    try {
      return {
        identity: createManualMediaIdentity(
          (options.manualIdFactory ?? generateManualMediaId)(),
        ),
        issues: [issue("MANUAL_ID_MISSING", "Manuel kayda degismez UUID atandi.", {
          recordId: media.id,
          repairable: true,
          severity: "warning",
        })],
      };
    } catch {
      return {
        issues: [issue("IDENTITY_UNRESOLVED", "Manuel UUID guvenli bicimde uretilemedi.", {
          recordId: media.id,
        })],
      };
    }
  }
  if (!media.externalId) {
    return {
      issues: [issue("IDENTITY_UNRESOLVED", "External source var fakat external id eksik.", {
        recordId: media.id,
      })],
    };
  }
  const resolved = namespaceForExternalMedia(
    media.externalSource,
    media.type,
    media.externalId,
    media.seasonNumber,
  );
  if (!resolved) {
    return {
      issues: [issue("IDENTITY_INVALID_NAMESPACE", "External source namespace guvenle cozumlenemedi.", {
        recordId: media.id,
      })],
    };
  }
  const identity = createCanonicalMediaIdentity({
    source: media.externalSource,
    namespace: resolved.namespace,
    stableId: resolved.stableId,
  });
  return identity
    ? { identity, issues: [] }
    : {
        issues: [issue("IDENTITY_UNRESOLVED", "External stable id canonical formata uymuyor.", {
          recordId: media.id,
        })],
      };
}

export function getCanonicalMediaIdentity(
  item: Pick<MediaItem, "id" | "identity">,
): CanonicalMediaIdentityV2 | null {
  const decoded = decodeCanonicalMediaIdentity(item.identity, item.id);
  return decoded.status === "invalid" ? null : decoded.value;
}

export function getCanonicalMediaKeyV2(
  item: Pick<MediaItem, "id" | "identity">,
): string | null {
  return getCanonicalMediaIdentity(item)?.key ?? null;
}

export function getLegacyCanonicalMediaKey(
  media: Pick<MediaItem, "id" | "title" | "type" | "externalSource" | "externalId">,
): string {
  if (media.externalSource && media.externalId) {
    return `${media.externalSource}:${media.externalId}`.toLowerCase();
  }
  return `local:${media.type}:${media.title.trim().toLocaleLowerCase("tr-TR")}`;
}

export function ensureMediaIdentity(
  item: MediaItem,
  options: {
    manualIdFactory?: () => string;
    legacyRecordId?: string;
  } = {},
): { item: MediaItem; issues: MediaIdentityIssue[] } {
  if (item.identity !== undefined) {
    const decoded = decodeCanonicalMediaIdentity(item.identity, item.id);
    if (decoded.status === "valid") return { item, issues: [] };
    if (decoded.status === "repairable") {
      return {
        item: { ...item, identity: decoded.value },
        issues: [decoded.issue],
      };
    }
    return {
      item: {
        ...item,
        identity: undefined,
        identityStatus: "unresolved",
        identityIssueCodes: [decoded.issue.code],
      },
      issues: [decoded.issue],
    };
  }
  const derived = deriveCanonicalMediaIdentity(item, options);
  return derived.identity
    ? {
        item: { ...item, identity: derived.identity },
        issues: [
          issue("IDENTITY_MISSING", "Legacy kayit icin Canonical Identity V2 turetildi.", {
            recordId: item.id,
            expectedIdentity: derived.identity.key,
            repairable: true,
            severity: "warning",
          }),
          ...derived.issues,
        ],
      }
    : { item, issues: derived.issues };
}

export function findExactIdentityCollisions(items: readonly MediaItem[]): MediaIdentityIssue[] {
  const records = new Map<string, string[]>();
  for (const item of items) {
    const key = getCanonicalMediaKeyV2(item);
    if (!key) continue;
    records.set(key, [...(records.get(key) ?? []), item.id]);
  }
  const issues: MediaIdentityIssue[] = [];
  for (const [key, recordIds] of records) {
    if (recordIds.length < 2) continue;
    for (const recordId of recordIds) {
      issues.push(issue("IDENTITY_EXACT_COLLISION", "Ayni V2 identity birden fazla local record tarafindan kullaniliyor.", {
        recordId,
        currentIdentity: key,
        expectedIdentity: key,
        severity: "warning",
        repairable: false,
      }));
    }
  }
  return issues;
}
