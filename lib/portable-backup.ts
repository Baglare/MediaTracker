import { validateBackupPayload } from "./backup";
import {
  decodeMediaItems,
  decodeProgressLogs,
} from "./local-data-codec";
import { decodeGoal } from "@/features/goals/domain/codec";
import type { Goal } from "@/features/goals/domain/types";
import { createGoalStoreCodec } from "@/features/goals/data/goal-store";
import { LOCAL_DATA_SCHEMA_VERSION } from "./local-data-storage";
import type { LocalOwnerScope } from "./local-owner-scope";
import {
  emptyMediaIdentityAliasRegistry,
  mediaIdentityAliasRegistryCodec,
  type MediaIdentityAliasRegistry,
} from "./media-identity-aliases";
import {
  emptyMediaRecordRedirectRegistry,
  mediaRecordRedirectRegistryCodec,
  type MediaRecordRedirectRegistry,
} from "./media-record-redirects";
import { inspectPersonalData } from "./personal-data-storage";
import {
  inspectRecommendationLinksForScope,
  type RecommendationLocalLink,
} from "./social/local-social";
import type { MediaItem, ProgressLog } from "./types";
import { decodeMediaReleaseCalendarData } from "../features/calendar/domain/manual-release-calendar";

export const PORTABLE_BACKUP_FORMAT = "mediatracker-portable-backup" as const;
export const PORTABLE_BACKUP_VERSION = 3 as const;
export const PORTABLE_BACKUP_SUPPORTED_VERSIONS = [2, 3] as const;
export const MAX_PORTABLE_BACKUP_BYTES = 10 * 1024 * 1024;

export const PORTABLE_BACKUP_DOMAINS = [
  "mediaItems",
  "progressLogs",
  "identityAliases",
  "recordRedirects",
  "recommendationLinks",
  "goals",
] as const;

export type PortableBackupDomain = (typeof PORTABLE_BACKUP_DOMAINS)[number];
export type PortableBackupOwnerType = "guest" | "authenticated";
export type PortableBackupIssueSeverity = "warning" | "error";

export interface PortableRecommendationLink {
  recommendationId: string;
  localMediaId: string;
  canonicalMediaKey: string;
  linkedAt: string;
}

export interface PortableBackupData {
  mediaItems?: MediaItem[];
  progressLogs?: ProgressLog[];
  identityAliases?: MediaIdentityAliasRegistry;
  recordRedirects?: MediaRecordRedirectRegistry;
  recommendationLinks?: PortableRecommendationLink[];
  goals?: Goal[];
}

export interface PortableBackupManifest {
  format: typeof PORTABLE_BACKUP_FORMAT;
  version: (typeof PORTABLE_BACKUP_SUPPORTED_VERSIONS)[number];
  exportedAt: string;
  application: {
    name: "MediaTracker";
    version: string;
  };
  schemas: {
    mediaEnvelope: number;
    canonicalIdentity: 2;
    progressLog: 1;
    identityAliasRegistry: 1;
    recordRedirectRegistry: 1;
    recommendationLink: 1;
    goal?: 1;
  };
  domains: PortableBackupDomain[];
  counts: Record<PortableBackupDomain, number>;
  ownerType: PortableBackupOwnerType;
  privacy: {
    personalNotesIncluded: boolean;
    rawProviderPayloadExcluded: true;
  };
  checksum: {
    algorithm: "SHA-256";
    value: string;
  };
}

export interface PortableBackupV2 {
  manifest: PortableBackupManifest;
  data: PortableBackupData;
}

export type PortableBackupV3 = PortableBackupV2;

export interface PortableBackupSource {
  ownerType: PortableBackupOwnerType;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  identityAliases: MediaIdentityAliasRegistry;
  recordRedirects: MediaRecordRedirectRegistry;
  recommendationLinks: PortableRecommendationLink[];
  goals?: Goal[];
}

export type PortableBackupSourceResult =
  | { ok: true; source: PortableBackupSource }
  | { ok: false; error: string };

export interface CreatePortableBackupOptions {
  exportedAt: string;
  includePersonalNotes: boolean;
  domains?: readonly PortableBackupDomain[];
  applicationVersion?: string;
}

export interface CreatedPortableBackup {
  backup: PortableBackupV2;
  serialized: string;
  byteSize: number;
}

export interface PortableBackupInspectionIssue {
  severity: PortableBackupIssueSeverity;
  code: string;
  message: string;
  domain?: PortableBackupDomain | "manifest" | "backup";
}

export interface PortableBackupInspectionSummary {
  kind: "portable-v2" | "portable-v3" | "legacy";
  compatible: boolean;
  format: string;
  version?: number;
  ownerType?: PortableBackupOwnerType;
  domains: string[];
  counts: Partial<Record<PortableBackupDomain, number>>;
  personalNotesIncluded: boolean;
  identity: {
    valid: number;
    unresolved: number;
    exactCollisions: number;
  };
  relationships: {
    groupedMedia: number;
    orphanProgressLogs: number;
    missingAliasTargets: number;
    missingRedirectTargets: number;
    missingRecommendationTargets: number;
  };
}

export interface PortableBackupInspectionResult {
  status: "valid" | "invalid" | "unsupported-version" | "legacy";
  issues: PortableBackupInspectionIssue[];
  errorCount: number;
  warningCount: number;
  summary: PortableBackupInspectionSummary;
}

export type DecodedPortableBackupResult =
  | {
      ok: true;
      manifest: PortableBackupManifest;
      data: PortableBackupData;
      inspection: PortableBackupInspectionResult;
    }
  | {
      ok: false;
      inspection: PortableBackupInspectionResult;
      error: string;
    };

const DOMAIN_SET = new Set<string>(PORTABLE_BACKUP_DOMAINS);
const V2_DOMAINS = PORTABLE_BACKUP_DOMAINS.filter((domain) => domain !== "goals");
const TOP_LEVEL_FIELDS = new Set(["manifest", "data"]);
const MANIFEST_FIELDS = new Set([
  "format",
  "version",
  "exportedAt",
  "application",
  "schemas",
  "domains",
  "counts",
  "ownerType",
  "privacy",
  "checksum",
]);
const BANNED_DOMAIN_NAMES = new Set([
  "authSession",
  "cloudSyncQueue",
  "syncQueue",
  "xpOutbox",
  "socialOutbox",
  "mergeJournal",
  "repairJournal",
  "integrityRepairJournal",
  "duplicateMergeJournal",
  "quarantine",
  "themeCloudSync",
  "aiSession",
  "aiFeedback",
  "profilePreferences",
  "customThemes",
  "devicePreferences",
]);
const SENSITIVE_KEY_PATTERN =
  /^(?:userId|ownerScope|authSession|accessToken|refreshToken|apiKey|secret|password|providerPayload|rawProviderPayload)$/i;
const MEDIA_ITEM_FIELDS = new Set([
  "id", "identity", "identityStatus", "identityIssueCodes", "title", "type",
  "theme", "mediaType", "subType", "status", "coverImage", "currentProgress",
  "totalProgress", "rating", "userRating", "favorite", "tags", "personalNotes",
  "externalSource", "externalId", "imdbId", "originalTitle", "overview",
  "releaseYear", "backdropUrl", "runtime", "numberOfSeasons", "numberOfEpisodes",
  "tvmazeStatus", "tmdbStatus", "lastAirDate", "nextAirDate", "genres",
  "networkName", "language", "seasonBreakdown", "seriesGroupId",
  "seriesGroupTitle", "seriesRelationType", "seasonNumber", "orderIndex",
  "authors", "pageCount", "editionCount", "languages", "subjects", "isbn",
  "nativeTitle", "episodes", "chapters", "volumes", "countryOfOrigin",
  "anilistStatus", "format", "averageScore", "popularity", "siteUrl",
  "nextAiringEpisode", "anilistRelations",
  "releaseCalendar",
]);
const PROGRESS_LOG_FIELDS = new Set([
  "id", "mediaId", "mediaTitle", "mediaType", "action", "detail", "amount",
  "unit", "previousProgress", "newProgress", "createdAt",
]);
const ALIAS_REGISTRY_FIELDS = new Set(["version", "records", "issues"]);
const ALIAS_RECORD_FIELDS = new Set([
  "alias", "canonicalKey", "aliasType", "createdAt",
]);
const REDIRECT_REGISTRY_FIELDS = new Set(["version", "records"]);
const REDIRECT_RECORD_FIELDS = new Set([
  "fromRecordId", "toRecordId", "operationId", "createdAt",
]);
const RECOMMENDATION_LINK_FIELDS = new Set([
  "recommendationId", "localMediaId", "canonicalMediaKey", "linkedAt",
]);
const GOAL_FIELDS = new Set([
  "id", "title", "origin", "scope", "metric", "schedule", "lifecycle",
  "createdAt", "updatedAt",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const normalized = canonicalize(entry);
      return normalized === undefined ? null : normalized;
    });
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function serializePortableBackup(value: PortableBackupV2): string {
  return JSON.stringify(canonicalize(value));
}

function checksumPayload(
  manifest: PortableBackupManifest,
  data: PortableBackupData,
): unknown {
  const withoutChecksum: Omit<PortableBackupManifest, "checksum"> & {
    checksum?: PortableBackupManifest["checksum"];
  } = { ...manifest };
  delete withoutChecksum.checksum;
  return { manifest: withoutChecksum, data };
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((entry) => entry.toString(16).padStart(2, "0"))
    .join("");
}

export async function computePortableBackupChecksum(
  manifest: PortableBackupManifest,
  data: PortableBackupData,
  cryptoApi: Pick<Crypto, "subtle"> | undefined = globalThis.crypto,
): Promise<string> {
  if (!cryptoApi?.subtle) throw new Error("portable_backup_checksum_unavailable");
  const serialized = JSON.stringify(canonicalize(checksumPayload(manifest, data)));
  const digest = await cryptoApi.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serialized),
  );
  return bytesToHex(digest);
}

function normalizeDomains(
  domains: readonly PortableBackupDomain[] | undefined,
): PortableBackupDomain[] {
  const selected = domains ?? PORTABLE_BACKUP_DOMAINS;
  return PORTABLE_BACKUP_DOMAINS.filter((domain) => selected.includes(domain));
}

function portableLink(link: RecommendationLocalLink): PortableRecommendationLink {
  return {
    recommendationId: link.recommendationId,
    localMediaId: link.localMediaId,
    canonicalMediaKey: link.canonicalMediaKey,
    linkedAt: link.linkedAt,
  };
}

function sanitizeMediaItems(
  items: readonly MediaItem[],
  includePersonalNotes: boolean,
): MediaItem[] {
  const decoded = decodeMediaItems([...items]);
  if (!decoded.ok) throw new Error("portable_backup_media_invalid");
  return decoded.records
    .map((item) => {
      const safe = { ...item } as MediaItem & Record<string, unknown>;
      delete safe.metadata;
      delete safe.providerPayload;
      delete safe.rawProviderPayload;
      if (!includePersonalNotes) delete safe.personalNotes;
      return safe;
    })
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function sanitizeProgressLogs(logs: readonly ProgressLog[]): ProgressLog[] {
  const decoded = decodeProgressLogs([...logs]);
  if (!decoded.ok) throw new Error("portable_backup_progress_invalid");
  return decoded.records.sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function sanitizeGoals(goals: readonly Goal[]): Goal[] {
  return goals.map((goal) => {
    const decoded = decodeGoal(goal);
    if (!decoded.ok) throw new Error("portable_backup_goal_invalid");
    return decoded.value;
  }).sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function normalizedAliases(
  registry: MediaIdentityAliasRegistry,
): MediaIdentityAliasRegistry {
  const decoded = mediaIdentityAliasRegistryCodec({
    ...registry,
    issues: [],
  });
  if (!decoded.ok) throw new Error("portable_backup_aliases_invalid");
  return {
    ...decoded.value,
    records: [...decoded.value.records].sort((left, right) =>
      left.alias.localeCompare(right.alias, "en")),
    issues: [],
  };
}

function normalizedRedirects(
  registry: MediaRecordRedirectRegistry,
): MediaRecordRedirectRegistry {
  const decoded = mediaRecordRedirectRegistryCodec(registry);
  if (!decoded.ok) throw new Error("portable_backup_redirects_invalid");
  return decoded.value;
}

export function collectPortableBackupSource(
  scope: LocalOwnerScope,
  mediaItems: readonly MediaItem[],
  progressLogs: readonly ProgressLog[],
  storage: Pick<Storage, "getItem"> | null =
    typeof window === "undefined" ? null : window.localStorage,
): PortableBackupSourceResult {
  if (!storage) return { ok: false, error: "Local storage kullanılamıyor." };
  const aliases = inspectPersonalData(
    scope,
    "mediaIdentityAliases",
    mediaIdentityAliasRegistryCodec,
    storage,
  );
  const redirects = inspectPersonalData(
    scope,
    "mediaRecordRedirects",
    mediaRecordRedirectRegistryCodec,
    storage,
  );
  const recommendationLinks = inspectRecommendationLinksForScope(scope, storage);
  const goals = inspectPersonalData(scope, "goals", createGoalStoreCodec(scope), storage);
  if (aliases.status !== "valid" && aliases.status !== "missing") {
    return { ok: false, error: "Identity alias registry export için doğrulanamadı." };
  }
  if (redirects.status !== "valid" && redirects.status !== "missing") {
    return { ok: false, error: "Record redirect registry export için doğrulanamadı." };
  }
  if (
    recommendationLinks.status !== "valid"
    && recommendationLinks.status !== "missing"
  ) {
    return { ok: false, error: "Recommendation link kayıtları doğrulanamadı." };
  }
  if (goals.status !== "valid" && goals.status !== "missing") {
    return { ok: false, error: "Goal kayıtları export için doğrulanamadı." };
  }
  if (recommendationLinks.issues.length > 0) {
    return { ok: false, error: "Recommendation link owner/codec uyuşmazlığı bulundu." };
  }
  return {
    ok: true,
    source: {
      ownerType: scope.kind === "guest" ? "guest" : "authenticated",
      mediaItems: [...mediaItems],
      progressLogs: [...progressLogs],
      identityAliases: aliases.status === "valid"
        ? aliases.data
        : emptyMediaIdentityAliasRegistry(),
      recordRedirects: redirects.status === "valid"
        ? redirects.data
        : emptyMediaRecordRedirectRegistry(),
      recommendationLinks: recommendationLinks.links
        .map(portableLink)
        .sort((left, right) =>
          left.recommendationId.localeCompare(right.recommendationId, "en")),
      goals: goals.status === "valid" ? goals.data.goals : [],
    },
  };
}

function emptyCounts(): Record<PortableBackupDomain, number> {
  return {
    mediaItems: 0,
    progressLogs: 0,
    identityAliases: 0,
    recordRedirects: 0,
    recommendationLinks: 0,
    goals: 0,
  };
}

export async function createPortableBackup(
  source: PortableBackupSource,
  options: CreatePortableBackupOptions,
): Promise<CreatedPortableBackup> {
  if (!Number.isFinite(Date.parse(options.exportedAt))) {
    throw new Error("portable_backup_exported_at_invalid");
  }
  const domains = normalizeDomains(options.domains);
  if (domains.length === 0) throw new Error("portable_backup_domain_missing");
  const data: PortableBackupData = {};
  const counts = emptyCounts();

  if (domains.includes("mediaItems")) {
    data.mediaItems = sanitizeMediaItems(
      source.mediaItems,
      options.includePersonalNotes,
    );
    counts.mediaItems = data.mediaItems.length;
  }
  if (domains.includes("progressLogs")) {
    data.progressLogs = sanitizeProgressLogs(source.progressLogs);
    counts.progressLogs = data.progressLogs.length;
  }
  if (domains.includes("identityAliases")) {
    data.identityAliases = normalizedAliases(source.identityAliases);
    counts.identityAliases = data.identityAliases.records.length;
  }
  if (domains.includes("recordRedirects")) {
    data.recordRedirects = normalizedRedirects(source.recordRedirects);
    counts.recordRedirects = data.recordRedirects.records.length;
  }
  if (domains.includes("recommendationLinks")) {
    data.recommendationLinks = [...source.recommendationLinks]
      .sort((left, right) =>
        left.recommendationId.localeCompare(right.recommendationId, "en"));
    counts.recommendationLinks = data.recommendationLinks.length;
  }
  if (domains.includes("goals")) {
    data.goals = sanitizeGoals(source.goals ?? []);
    counts.goals = data.goals.length;
  }

  const manifest: PortableBackupManifest = {
    format: PORTABLE_BACKUP_FORMAT,
    version: PORTABLE_BACKUP_VERSION,
    exportedAt: options.exportedAt,
    application: {
      name: "MediaTracker",
      version: options.applicationVersion ?? "0.1.0",
    },
    schemas: {
      mediaEnvelope: LOCAL_DATA_SCHEMA_VERSION,
      canonicalIdentity: 2,
      progressLog: 1,
      identityAliasRegistry: 1,
      recordRedirectRegistry: 1,
      recommendationLink: 1,
      goal: 1,
    },
    domains,
    counts,
    ownerType: source.ownerType,
    privacy: {
      personalNotesIncluded:
        domains.includes("mediaItems") && options.includePersonalNotes,
      rawProviderPayloadExcluded: true,
    },
    checksum: { algorithm: "SHA-256", value: "" },
  };
  manifest.checksum.value = await computePortableBackupChecksum(manifest, data);
  const backup = { manifest, data } satisfies PortableBackupV2;
  const serialized = serializePortableBackup(backup);
  return {
    backup,
    serialized,
    byteSize: new TextEncoder().encode(serialized).byteLength,
  };
}

function issue(
  issues: PortableBackupInspectionIssue[],
  severity: PortableBackupIssueSeverity,
  code: string,
  message: string,
  domain?: PortableBackupInspectionIssue["domain"],
) {
  issues.push({ severity, code, message, domain });
}

function emptySummary(
  kind: PortableBackupInspectionSummary["kind"],
  format: string,
): PortableBackupInspectionSummary {
  return {
    kind,
    compatible: false,
    format,
    domains: [],
    counts: {},
    personalNotesIncluded: false,
    identity: { valid: 0, unresolved: 0, exactCollisions: 0 },
    relationships: {
      groupedMedia: 0,
      orphanProgressLogs: 0,
      missingAliasTargets: 0,
      missingRedirectTargets: 0,
      missingRecommendationTargets: 0,
    },
  };
}

function result(
  status: PortableBackupInspectionResult["status"],
  issues: PortableBackupInspectionIssue[],
  summary: PortableBackupInspectionSummary,
): PortableBackupInspectionResult {
  return {
    status,
    issues,
    errorCount: issues.filter((entry) => entry.severity === "error").length,
    warningCount: issues.filter((entry) => entry.severity === "warning").length,
    summary,
  };
}

function inspectUnknownAndSensitiveFields(
  parsed: Record<string, unknown>,
  issues: PortableBackupInspectionIssue[],
) {
  for (const key of Object.keys(parsed)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      issue(issues, "warning", "UNKNOWN_TOP_LEVEL_FIELD", `Bilinmeyen üst alan: ${key}.`, "backup");
    }
  }
  if (isRecord(parsed.manifest)) {
    for (const key of Object.keys(parsed.manifest)) {
      if (!MANIFEST_FIELDS.has(key)) {
        issue(issues, "warning", "UNKNOWN_MANIFEST_FIELD", `Bilinmeyen manifest alanı: ${key}.`, "manifest");
      }
    }
  }
  if (isRecord(parsed.data)) {
    for (const key of Object.keys(parsed.data)) {
      if (BANNED_DOMAIN_NAMES.has(key)) {
        issue(issues, "error", "FORBIDDEN_DOMAIN", `Yasak backup domain'i bulundu: ${key}.`, "backup");
      } else if (!DOMAIN_SET.has(key)) {
        issue(issues, "warning", "UNKNOWN_DATA_DOMAIN", `Bilinmeyen data domain'i: ${key}.`, "backup");
      }
    }
  }

  const stack: unknown[] = [parsed];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (!isRecord(value)) continue;
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        issue(issues, "error", "SENSITIVE_FIELD", `Yasak veya owner-bound alan bulundu: ${key}.`, "backup");
      }
      stack.push(entry);
    }
  }
}

function inspectRecordUnknownFields(
  values: unknown,
  allowed: ReadonlySet<string>,
  issues: PortableBackupInspectionIssue[],
  domain: PortableBackupDomain,
  label: string,
) {
  if (!Array.isArray(values)) return;
  values.forEach((value, index) => {
    if (!isRecord(value)) return;
    for (const key of Object.keys(value)) {
      if (allowed.has(key)) continue;
      issue(
        issues,
        key === "metadata" ? "error" : "warning",
        key === "metadata" ? "FORBIDDEN_MEDIA_FIELD" : "UNKNOWN_RECORD_FIELD",
        `${label} ${index + 1} bilinmeyen/taşınamaz alan içeriyor: ${key}.`,
        domain,
      );
    }
  });
}

function inspectDomainUnknownFields(
  data: Record<string, unknown>,
  issues: PortableBackupInspectionIssue[],
) {
  inspectRecordUnknownFields(
    data.mediaItems,
    MEDIA_ITEM_FIELDS,
    issues,
    "mediaItems",
    "MediaItem",
  );
  if (Array.isArray(data.mediaItems)) {
    data.mediaItems.forEach((value, index) => {
      if (!isRecord(value) || value.releaseCalendar === undefined) return;
      const decoded = decodeMediaReleaseCalendarData(
        value.releaseCalendar,
        typeof value.id === "string" ? value.id : undefined,
      );
      decoded.issues.forEach((entry) => issue(
        issues,
        "error",
        entry.code,
        `MediaItem ${index + 1}: ${entry.message}`,
        "mediaItems",
      ));
    });
  }
  inspectRecordUnknownFields(
    data.progressLogs,
    PROGRESS_LOG_FIELDS,
    issues,
    "progressLogs",
    "ProgressLog",
  );
  inspectRecordUnknownFields(
    data.recommendationLinks,
    RECOMMENDATION_LINK_FIELDS,
    issues,
    "recommendationLinks",
    "Recommendation link",
  );
  inspectRecordUnknownFields(data.goals, GOAL_FIELDS, issues, "goals", "Goal");
  if (isRecord(data.identityAliases)) {
    for (const key of Object.keys(data.identityAliases)) {
      if (!ALIAS_REGISTRY_FIELDS.has(key)) {
        issue(issues, "warning", "UNKNOWN_REGISTRY_FIELD", `Alias registry bilinmeyen alan içeriyor: ${key}.`, "identityAliases");
      }
    }
    inspectRecordUnknownFields(
      data.identityAliases.records,
      ALIAS_RECORD_FIELDS,
      issues,
      "identityAliases",
      "Alias",
    );
  }
  if (isRecord(data.recordRedirects)) {
    for (const key of Object.keys(data.recordRedirects)) {
      if (!REDIRECT_REGISTRY_FIELDS.has(key)) {
        issue(issues, "warning", "UNKNOWN_REGISTRY_FIELD", `Redirect registry bilinmeyen alan içeriyor: ${key}.`, "recordRedirects");
      }
    }
    inspectRecordUnknownFields(
      data.recordRedirects.records,
      REDIRECT_RECORD_FIELDS,
      issues,
      "recordRedirects",
      "Redirect",
    );
  }
}

function validPortableLink(value: unknown): value is PortableRecommendationLink {
  if (!isRecord(value)) return false;
  return ["recommendationId", "localMediaId", "canonicalMediaKey", "linkedAt"]
    .every((key) => typeof value[key] === "string" && value[key].length > 0)
    && Number.isFinite(Date.parse(value.linkedAt as string));
}

function duplicateCount(values: readonly string[]): number {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.values()].filter((count) => count > 1).length;
}

function decodePortableGoals(values: unknown): {
  goals: Goal[];
  malformed: number;
  duplicateSame: number;
  duplicateConflict: number;
} {
  if (!Array.isArray(values)) {
    return { goals: [], malformed: 1, duplicateSame: 0, duplicateConflict: 0 };
  }
  const byId = new Map<string, { goal: Goal; payload: string; conflict: boolean }>();
  let malformed = 0;
  let duplicateSame = 0;
  let duplicateConflict = 0;
  for (const value of values) {
    const decoded = decodeGoal(value);
    if (!decoded.ok) {
      malformed += 1;
      continue;
    }
    const payload = JSON.stringify(canonicalize(decoded.value));
    const prior = byId.get(decoded.value.id);
    if (!prior) {
      byId.set(decoded.value.id, { goal: decoded.value, payload, conflict: false });
    } else if (prior.payload === payload) {
      duplicateSame += 1;
    } else {
      duplicateConflict += 1;
      prior.conflict = true;
    }
  }
  return {
    goals: [...byId.values()].filter((entry) => !entry.conflict).map((entry) => entry.goal)
      .sort((left, right) => left.id.localeCompare(right.id, "en")),
    malformed,
    duplicateSame,
    duplicateConflict,
  };
}

function legacyInspection(parsed: Record<string, unknown>): PortableBackupInspectionResult | null {
  if (parsed.appName !== "MediaTracker" || !isRecord(parsed.data)) return null;
  const validation = validateBackupPayload(parsed);
  const issues: PortableBackupInspectionIssue[] = [{
    severity: "warning",
    code: "LEGACY_BACKUP",
    message: validation.valid
      ? "Legacy MediaTracker backup tanındı; Portable V2 checksum/domain manifesti içermez."
      : "Legacy MediaTracker backup tanındı fakat codec doğrulamasını geçemedi.",
    domain: "backup",
  }];
  if (!validation.valid) {
    issue(issues, "error", "LEGACY_BACKUP_INVALID", validation.error, "backup");
  }
  const summary = emptySummary("legacy", "MediaTracker legacy backup");
  summary.compatible = validation.valid;
  summary.domains = ["mediaItems", "progressLogs"];
  summary.counts = {
    mediaItems: validation.valid ? validation.items.length : 0,
    progressLogs: validation.valid ? validation.logs.length : 0,
  };
  return result("legacy", issues, summary);
}

export async function inspectPortableBackupText(
  text: string,
  cryptoApi: Pick<Crypto, "subtle"> | undefined = globalThis.crypto,
): Promise<PortableBackupInspectionResult> {
  const issues: PortableBackupInspectionIssue[] = [];
  const byteSize = new TextEncoder().encode(text).byteLength;
  if (byteSize > MAX_PORTABLE_BACKUP_BYTES) {
    issue(issues, "error", "FILE_TOO_LARGE", "Backup dosyası 10 MiB sınırını aşıyor.", "backup");
    return result("invalid", issues, emptySummary("portable-v2", "unknown"));
  }
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(text);
  } catch {
    issue(issues, "error", "CORRUPT_JSON", "Backup JSON parse edilemedi.", "backup");
    return result("invalid", issues, emptySummary("portable-v2", "unknown"));
  }
  if (!isRecord(parsedValue)) {
    issue(issues, "error", "BACKUP_NOT_OBJECT", "Backup kök değeri obje olmalıdır.", "backup");
    return result("invalid", issues, emptySummary("portable-v2", "unknown"));
  }
  const legacy = legacyInspection(parsedValue);
  if (legacy) return legacy;

  inspectUnknownAndSensitiveFields(parsedValue, issues);
  if (!isRecord(parsedValue.manifest) || !isRecord(parsedValue.data)) {
    issue(issues, "error", "MANIFEST_OR_DATA_MISSING", "Manifest veya data objesi bulunamadı.", "manifest");
    return result("invalid", issues, emptySummary("portable-v2", "unknown"));
  }
  const manifest = parsedValue.manifest;
  const data = parsedValue.data;
  inspectDomainUnknownFields(data, issues);
  const format = typeof manifest.format === "string" ? manifest.format : "unknown";
  const summary = emptySummary("portable-v2", format);
  if (manifest.format !== PORTABLE_BACKUP_FORMAT) {
    issue(issues, "error", "INVALID_FORMAT", "Dosya Portable MediaTracker backup formatında değil.", "manifest");
  }
  if (manifest.version !== 2 && manifest.version !== PORTABLE_BACKUP_VERSION) {
    issue(issues, "error", "UNSUPPORTED_VERSION", "Portable backup sürümü desteklenmiyor.", "manifest");
    summary.version = typeof manifest.version === "number" ? manifest.version : undefined;
    return result("unsupported-version", issues, summary);
  }
  const portableVersion = manifest.version as 2 | 3;
  summary.kind = portableVersion === 3 ? "portable-v3" : "portable-v2";
  summary.version = portableVersion;

  if (
    typeof manifest.exportedAt !== "string"
    || !Number.isFinite(Date.parse(manifest.exportedAt))
    || !isRecord(manifest.application)
    || manifest.application.name !== "MediaTracker"
    || typeof manifest.application.version !== "string"
    || !isRecord(manifest.schemas)
    || !isRecord(manifest.counts)
    || !isRecord(manifest.privacy)
    || !isRecord(manifest.checksum)
    || manifest.checksum.algorithm !== "SHA-256"
    || typeof manifest.checksum.value !== "string"
    || typeof manifest.privacy.personalNotesIncluded !== "boolean"
    || manifest.privacy.rawProviderPayloadExcluded !== true
    || manifest.schemas.canonicalIdentity !== 2
    || manifest.schemas.progressLog !== 1
    || manifest.schemas.identityAliasRegistry !== 1
    || manifest.schemas.recordRedirectRegistry !== 1
    || manifest.schemas.recommendationLink !== 1
    || (portableVersion === 3 && manifest.schemas.goal !== 1)
    || !Array.isArray(manifest.domains)
    || (manifest.ownerType !== "guest" && manifest.ownerType !== "authenticated")
  ) {
    issue(issues, "error", "MANIFEST_INVALID", "Portable backup manifesti geçersiz.", "manifest");
    return result("invalid", issues, summary);
  }

  const allowedDomains = portableVersion === 3 ? PORTABLE_BACKUP_DOMAINS : V2_DOMAINS;
  if (portableVersion === 2 && data.goals !== undefined) {
    issue(issues, "error", "UNDECLARED_DOMAIN", "Portable V2 goals domain'i taşıyamaz.", "goals");
  }
  const allowedDomainSet = new Set<string>(allowedDomains);
  const domains = manifest.domains.filter(
    (entry): entry is PortableBackupDomain =>
      typeof entry === "string" && allowedDomainSet.has(entry),
  );
  if (
    domains.length !== manifest.domains.length
    || new Set(domains).size !== domains.length
    || domains.length === 0
  ) {
    issue(issues, "error", "DOMAIN_LIST_INVALID", "Manifest domain listesi geçersiz.", "manifest");
  }
  summary.domains = domains;
  summary.ownerType = manifest.ownerType;
  summary.personalNotesIncluded = manifest.privacy.personalNotesIncluded === true;
  for (const domain of allowedDomains) {
    if (!domains.includes(domain) && data[domain] !== undefined) {
      issue(issues, "error", "UNDECLARED_DOMAIN", `Data içinde manifestte seçilmemiş domain var: ${domain}.`, domain);
    }
    if (!domains.includes(domain) && manifest.counts[domain] !== 0) {
      issue(issues, "error", "UNSELECTED_DOMAIN_COUNT", `Seçilmemiş domain count değeri sıfır olmalıdır: ${domain}.`, domain);
    }
  }

  let checksum = "";
  try {
    checksum = await computePortableBackupChecksum(
      manifest as unknown as PortableBackupManifest,
      data as PortableBackupData,
      cryptoApi,
    );
  } catch {
    issue(issues, "error", "CHECKSUM_UNAVAILABLE", "SHA-256 checksum doğrulanamadı.", "manifest");
  }
  if (checksum && checksum !== manifest.checksum.value) {
    issue(issues, "error", "CHECKSUM_MISMATCH", "Backup checksum değeri içerikle eşleşmiyor.", "manifest");
  }

  const decodedMedia = Array.isArray(data.mediaItems)
    ? decodeMediaItems(data.mediaItems)
    : null;
  const decodedLogs = Array.isArray(data.progressLogs)
    ? decodeProgressLogs(data.progressLogs)
    : null;
  let aliases: MediaIdentityAliasRegistry | null = null;
  let redirects: MediaRecordRedirectRegistry | null = null;
  let links: PortableRecommendationLink[] = [];
  let goals: Goal[] = [];

  for (const domain of domains) {
    const domainValue = data[domain];
    if (domainValue === undefined) {
      issue(issues, "error", "SELECTED_DOMAIN_MISSING", `Seçili domain data içinde yok: ${domain}.`, domain);
    }
  }
  if (domains.includes("mediaItems")) {
    if (!decodedMedia?.ok) {
      issue(issues, "error", "MEDIA_CODEC_INVALID", "MediaItem kayıtları runtime codec doğrulamasını geçemedi.", "mediaItems");
    } else {
      summary.counts.mediaItems = decodedMedia.records.length;
      decodedMedia.repairs.forEach((entry) =>
        issue(issues, "warning", "MEDIA_REPAIRABLE", `Media kaydı normalize edilebilir: ${entry.path}.`, "mediaItems"));
      decodedMedia.warnings.forEach((entry) =>
        issue(issues, "warning", "MEDIA_CODEC_WARNING", `Media codec uyarısı: ${entry.path}.`, "mediaItems"));
      if (duplicateCount(decodedMedia.records.map((item) => item.id)) > 0) {
        issue(issues, "error", "DUPLICATE_MEDIA_ID", "Duplicate MediaItem.id bulundu.", "mediaItems");
      }
      const containsPersonalNotes = decodedMedia.records.some((item) =>
        typeof item.personalNotes === "string" && item.personalNotes.length > 0);
      if (containsPersonalNotes && !summary.personalNotesIncluded) {
        issue(
          issues,
          "error",
          "PERSONAL_NOTES_MANIFEST_MISMATCH",
          "Personal note içeriği manifest privacy seçimiyle eşleşmiyor.",
          "mediaItems",
        );
      }
    }
  }
  if (domains.includes("progressLogs")) {
    if (!decodedLogs?.ok) {
      issue(issues, "error", "PROGRESS_CODEC_INVALID", "ProgressLog kayıtları runtime codec doğrulamasını geçemedi.", "progressLogs");
    } else {
      summary.counts.progressLogs = decodedLogs.records.length;
      decodedLogs.repairs.forEach((entry) =>
        issue(issues, "warning", "PROGRESS_REPAIRABLE", `Progress log normalize edilebilir: ${entry.path}.`, "progressLogs"));
      if (duplicateCount(decodedLogs.records.map((entry) => entry.id)) > 0) {
        issue(issues, "error", "DUPLICATE_PROGRESS_LOG_ID", "Duplicate ProgressLog.id bulundu.", "progressLogs");
      }
    }
  }
  if (domains.includes("identityAliases")) {
    const decoded = mediaIdentityAliasRegistryCodec(data.identityAliases);
    if (!decoded.ok) {
      issue(issues, "error", "ALIAS_CODEC_INVALID", "Identity alias registry doğrulanamadı.", "identityAliases");
    } else {
      aliases = decoded.value;
      summary.counts.identityAliases = aliases.records.length;
    }
  }
  if (domains.includes("recordRedirects")) {
    const decoded = mediaRecordRedirectRegistryCodec(data.recordRedirects);
    if (!decoded.ok) {
      issue(issues, "error", "REDIRECT_CODEC_INVALID", "Record redirect registry doğrulanamadı.", "recordRedirects");
    } else {
      redirects = decoded.value;
      summary.counts.recordRedirects = redirects.records.length;
    }
  }
  if (domains.includes("recommendationLinks")) {
    if (!Array.isArray(data.recommendationLinks) || !data.recommendationLinks.every(validPortableLink)) {
      issue(issues, "error", "RECOMMENDATION_LINK_CODEC_INVALID", "Recommendation link kayıtları doğrulanamadı.", "recommendationLinks");
    } else {
      links = data.recommendationLinks as PortableRecommendationLink[];
      summary.counts.recommendationLinks = links.length;
    }
  }
  if (domains.includes("goals")) {
    const decoded = decodePortableGoals(data.goals);
    goals = decoded.goals;
    summary.counts.goals = Array.isArray(data.goals) ? data.goals.length : 0;
    if (decoded.malformed > 0) {
      issue(issues, "warning", "GOAL_CODEC_INVALID", `${decoded.malformed} bozuk Goal kaydı import dışında bırakılacak.`, "goals");
    }
    if (decoded.duplicateSame > 0) {
      issue(issues, "warning", "DUPLICATE_GOAL_ID_SAME", "Aynı payload taşıyan yinelenen Goal kayıtları bir kez değerlendirilecek.", "goals");
    }
    if (decoded.duplicateConflict > 0) {
      issue(issues, "warning", "DUPLICATE_GOAL_ID_CONFLICT", "Aynı ID ve farklı payload taşıyan Goal kayıtları import dışında bırakılacak.", "goals");
    }
  }

  for (const domain of domains) {
    const expected = manifest.counts[domain];
    const actual = summary.counts[domain];
    if (
      typeof expected !== "number"
      || !Number.isInteger(expected)
      || expected < 0
      || actual !== expected
    ) {
      issue(issues, "error", "COUNT_MISMATCH", `${domain} manifest count değeri data ile eşleşmiyor.`, domain);
    }
  }

  const media = decodedMedia?.ok ? decodedMedia.records : [];
  const logs = decodedLogs?.ok ? decodedLogs.records : [];
  const mediaIds = new Set(media.map((item) => item.id));
  const identityCounts = new Map<string, number>();
  media.forEach((item) => {
    if (item.identity) {
      identityCounts.set(item.identity.key, (identityCounts.get(item.identity.key) ?? 0) + 1);
    }
  });
  summary.identity.valid = media.filter((item) => Boolean(item.identity)).length;
  summary.identity.unresolved = media.filter((item) => !item.identity).length;
  summary.identity.exactCollisions = [...identityCounts.values()]
    .filter((count) => count > 1).length;
  if (summary.identity.unresolved > 0) {
    issue(issues, "warning", "UNRESOLVED_IDENTITY", "Backup unresolved media identity içeriyor.", "mediaItems");
  }
  if (summary.identity.exactCollisions > 0) {
    issue(issues, "warning", "EXACT_IDENTITY_COLLISION", "Backup exact canonical identity collision içeriyor.", "mediaItems");
  }
  summary.relationships.groupedMedia = media.filter((item) =>
    Boolean(item.seriesGroupId)).length;
  summary.relationships.orphanProgressLogs = logs.filter((entry) =>
    !mediaIds.has(entry.mediaId)).length;
  const identityKeys = new Set(media.flatMap((item) =>
    item.identity ? [item.identity.key] : []));
  summary.relationships.missingAliasTargets = aliases?.records.filter((entry) =>
    !identityKeys.has(entry.canonicalKey)).length ?? 0;
  summary.relationships.missingRedirectTargets = redirects?.records.filter((entry) =>
    !mediaIds.has(entry.toRecordId)).length ?? 0;
  summary.relationships.missingRecommendationTargets = links.filter((entry) =>
    !mediaIds.has(entry.localMediaId)).length;
  const missingGoalTargets = goals.filter((goal) =>
    goal.scope.kind === "media" && !mediaIds.has(goal.scope.mediaRecordId)).length;

  if (summary.relationships.orphanProgressLogs > 0) {
    issue(issues, "warning", "ORPHAN_PROGRESS_LOG", "Backup orphan progress log içeriyor.", "progressLogs");
  }
  if (summary.relationships.missingAliasTargets > 0) {
    issue(issues, "warning", "MISSING_ALIAS_TARGET", "Alias hedeflerinden bazıları backup media identity listesinde yok.", "identityAliases");
  }
  if (summary.relationships.missingRedirectTargets > 0) {
    issue(issues, "warning", "MISSING_REDIRECT_TARGET", "Redirect hedeflerinden bazıları backup media listesinde yok.", "recordRedirects");
  }
  if (summary.relationships.missingRecommendationTargets > 0) {
    issue(issues, "warning", "MISSING_RECOMMENDATION_TARGET", "Recommendation link hedeflerinden bazıları backup media listesinde yok.", "recommendationLinks");
  }
  if (missingGoalTargets > 0) {
    issue(issues, "warning", "GOAL_MEDIA_MISSING", "Bazı Goal kayıtlarının exact mediaRecordId hedefi backup içinde bulunmuyor; kayıt korunacak.", "goals");
  }

  summary.compatible = issues.every((entry) => entry.severity !== "error");
  return result(summary.compatible ? "valid" : "invalid", issues, summary);
}

/**
 * D1E.2 preflight/executor boundary. It performs the same read-only inspection
 * first and returns only canonical codec output; it never writes local state.
 */
export async function decodePortableBackupForImport(
  text: string,
  cryptoApi: Pick<Crypto, "subtle"> | undefined = globalThis.crypto,
): Promise<DecodedPortableBackupResult> {
  const inspection = await inspectPortableBackupText(text, cryptoApi);
  if (inspection.status !== "valid") {
    const issueCodes = [...new Set(inspection.issues.map((issue) => issue.code))].join(", ");
    return {
      ok: false,
      inspection,
      error: inspection.status === "legacy"
        ? "Legacy backup additive Portable V2 import yoluna giremez."
        : `Portable backup import preflight doğrulamasını geçemedi${
            issueCodes ? ` (${issueCodes})` : ""
          }.`,
    };
  }
  const parsed = JSON.parse(text) as PortableBackupV2;
  const data: PortableBackupData = {};
  if (parsed.manifest.domains.includes("mediaItems")) {
    const decoded = decodeMediaItems(parsed.data.mediaItems ?? []);
    if (!decoded.ok) return { ok: false, inspection, error: "Media codec doğrulaması başarısız." };
    data.mediaItems = decoded.records;
  }
  if (parsed.manifest.domains.includes("progressLogs")) {
    const decoded = decodeProgressLogs(parsed.data.progressLogs ?? []);
    if (!decoded.ok) return { ok: false, inspection, error: "Progress codec doğrulaması başarısız." };
    data.progressLogs = decoded.records;
  }
  if (parsed.manifest.domains.includes("identityAliases")) {
    const decoded = mediaIdentityAliasRegistryCodec(parsed.data.identityAliases);
    if (!decoded.ok) return { ok: false, inspection, error: "Alias codec doğrulaması başarısız." };
    data.identityAliases = decoded.value;
  }
  if (parsed.manifest.domains.includes("recordRedirects")) {
    const decoded = mediaRecordRedirectRegistryCodec(parsed.data.recordRedirects);
    if (!decoded.ok) return { ok: false, inspection, error: "Redirect codec doğrulaması başarısız." };
    data.recordRedirects = decoded.value;
  }
  if (parsed.manifest.domains.includes("recommendationLinks")) {
    const links = parsed.data.recommendationLinks ?? [];
    if (!links.every(validPortableLink)) {
      return { ok: false, inspection, error: "Recommendation link codec doğrulaması başarısız." };
    }
    data.recommendationLinks = links;
  }
  if (parsed.manifest.domains.includes("goals")) {
    data.goals = decodePortableGoals(parsed.data.goals).goals;
  }
  return {
    ok: true,
    manifest: parsed.manifest,
    data,
    inspection,
  };
}

export function portableBackupFilename(exportedAt: string): string {
  const date = Number.isFinite(Date.parse(exportedAt))
    ? new Date(exportedAt).toISOString().slice(0, 10)
    : "unknown-date";
  return `mediatracker-portable-v3-${date}.json`;
}
