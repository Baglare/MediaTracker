import {
  findExactIdentityCollisions,
  getCanonicalMediaKeyV2,
  getLegacyCanonicalMediaKey,
  isMediaIdentityIssueCode,
  parseCanonicalMediaKeyV2,
  type MediaIdentityIssue,
} from "./media-identity";
import type { LocalOwnerScope } from "./local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "./personal-data-storage";
import type { StorageWriteResult } from "./local-data-storage";
import type { MediaItem } from "./types";

export type MediaIdentityAliasType =
  | "legacy-canonical-key"
  | "record-id"
  | "previous-provider-key"
  | "merged-canonical-key";

export interface MediaIdentityAliasRecord {
  alias: string;
  canonicalKey: string;
  aliasType: MediaIdentityAliasType;
  createdAt: string;
}

export interface MediaIdentityAliasRegistry {
  version: 1;
  records: MediaIdentityAliasRecord[];
  issues: MediaIdentityIssue[];
}

export interface AliasRegistryUpdateResult {
  registry: MediaIdentityAliasRegistry;
  issues: MediaIdentityIssue[];
}

const ALIAS_TYPES = new Set<MediaIdentityAliasType>([
  "legacy-canonical-key",
  "record-id",
  "previous-provider-key",
  "merged-canonical-key",
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAlias(alias: string): string {
  return alias.trim().toLowerCase();
}

function collisionIssue(
  alias: string,
  currentCanonicalKey: string,
  expectedCanonicalKey: string,
): MediaIdentityIssue {
  return {
    id: `identity:IDENTITY_ALIAS_COLLISION:${alias}:${expectedCanonicalKey}`,
    code: "IDENTITY_ALIAS_COLLISION",
    severity: "warning",
    currentIdentity: currentCanonicalKey,
    expectedIdentity: expectedCanonicalKey,
    repairable: false,
    evidence: `Alias birden fazla V2 key'e isaret ediyor: ${alias}`,
  };
}

function decodeIssue(value: unknown): MediaIdentityIssue | null {
  if (!isRecord(value)) return null;
  const code = value.code;
  if (
    typeof value.id !== "string"
    || typeof code !== "string"
    || !isMediaIdentityIssueCode(code)
    || typeof value.evidence !== "string"
    || (value.severity !== "warning" && value.severity !== "error")
    || typeof value.repairable !== "boolean"
  ) return null;
  return {
    id: value.id,
    code: code as MediaIdentityIssue["code"],
    severity: value.severity,
    recordId: typeof value.recordId === "string" ? value.recordId : undefined,
    currentIdentity: typeof value.currentIdentity === "string"
      ? value.currentIdentity
      : undefined,
    expectedIdentity: typeof value.expectedIdentity === "string"
      ? value.expectedIdentity
      : undefined,
    repairable: value.repairable,
    evidence: value.evidence,
  };
}

export const mediaIdentityAliasRegistryCodec: PersonalDataCodec<MediaIdentityAliasRegistry> = (
  value,
) => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.records)) {
    return { ok: false, message: "Media identity alias registry formati gecersiz." };
  }
  const records: MediaIdentityAliasRecord[] = [];
  const issues = Array.isArray(value.issues)
    ? value.issues.map(decodeIssue).filter((entry): entry is MediaIdentityIssue => Boolean(entry))
    : [];
  const byAlias = new Map<string, MediaIdentityAliasRecord>();
  for (const raw of value.records) {
    if (
      !isRecord(raw)
      || typeof raw.alias !== "string"
      || typeof raw.canonicalKey !== "string"
      || typeof raw.aliasType !== "string"
      || !ALIAS_TYPES.has(raw.aliasType as MediaIdentityAliasType)
      || typeof raw.createdAt !== "string"
      || !Number.isFinite(Date.parse(raw.createdAt))
    ) {
      return { ok: false, message: "Media identity alias kaydi gecersiz." };
    }
    const identity = parseCanonicalMediaKeyV2(raw.canonicalKey);
    const alias = normalizeAlias(raw.alias);
    const aliasIdentity = parseCanonicalMediaKeyV2(alias);
    if (
      !identity
      || !alias
      || (aliasIdentity && raw.aliasType !== "merged-canonical-key")
      || aliasIdentity?.key === identity.key
    ) {
      return { ok: false, message: "Alias dogrudan ve gecerli bir V2 canonical key'e gitmelidir." };
    }
    const next: MediaIdentityAliasRecord = {
      alias,
      canonicalKey: identity.key,
      aliasType: raw.aliasType as MediaIdentityAliasType,
      createdAt: raw.createdAt,
    };
    const existing = byAlias.get(alias);
    if (existing && existing.canonicalKey !== next.canonicalKey) {
      issues.push(collisionIssue(alias, existing.canonicalKey, next.canonicalKey));
      continue;
    }
    if (!existing) {
      byAlias.set(alias, next);
      records.push(next);
    }
  }
  const aliasKeys = new Set(records.map((entry) => normalizeAlias(entry.alias)));
  if (records.some((entry) => aliasKeys.has(normalizeAlias(entry.canonicalKey)))) {
    return { ok: false, message: "Media identity alias chain veya cycle iceremez." };
  }
  return {
    ok: true,
    value: {
      version: 1,
      records,
      issues: dedupeIssues(issues),
    },
  };
};

function dedupeIssues(issues: readonly MediaIdentityIssue[]): MediaIdentityIssue[] {
  return [...new Map(issues.map((entry) => [entry.id, entry])).values()];
}

export function emptyMediaIdentityAliasRegistry(): MediaIdentityAliasRegistry {
  return { version: 1, records: [], issues: [] };
}

export function readMediaIdentityAliasRegistry(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike | null,
): PersonalDataReadResult<MediaIdentityAliasRegistry> {
  return readPersonalData(
    scope,
    "mediaIdentityAliases",
    mediaIdentityAliasRegistryCodec,
    storage,
  );
}

export function writeMediaIdentityAliasRegistry(
  scope: LocalOwnerScope,
  registry: MediaIdentityAliasRegistry,
  storage?: PersonalStorageLike | null,
): StorageWriteResult {
  return writePersonalData(
    scope,
    "mediaIdentityAliases",
    registry,
    mediaIdentityAliasRegistryCodec,
    storage,
  );
}

export function aliasesForMediaItems(
  items: readonly MediaItem[],
  createdAt = new Date().toISOString(),
): { records: MediaIdentityAliasRecord[]; issues: MediaIdentityIssue[] } {
  const records: MediaIdentityAliasRecord[] = [];
  for (const item of items) {
    const canonicalKey = getCanonicalMediaKeyV2(item);
    if (!canonicalKey) continue;
    records.push(
      {
        alias: normalizeAlias(getLegacyCanonicalMediaKey(item)),
        canonicalKey,
        aliasType: "legacy-canonical-key",
        createdAt,
      },
      {
        alias: normalizeAlias(item.id),
        canonicalKey,
        aliasType: "record-id",
        createdAt,
      },
    );
  }
  return { records, issues: findExactIdentityCollisions(items) };
}

export function updateMediaIdentityAliases(
  current: MediaIdentityAliasRegistry,
  additions: readonly MediaIdentityAliasRecord[],
  additionalIssues: readonly MediaIdentityIssue[] = [],
): AliasRegistryUpdateResult {
  const records = [...current.records];
  const byAlias = new Map(records.map((entry) => [entry.alias, entry]));
  const issues = [...current.issues, ...additionalIssues];
  for (const raw of additions) {
    const alias = normalizeAlias(raw.alias);
    const canonical = parseCanonicalMediaKeyV2(raw.canonicalKey);
    const aliasIdentity = parseCanonicalMediaKeyV2(alias);
    if (
      !alias
      || !canonical
      || (aliasIdentity && raw.aliasType !== "merged-canonical-key")
      || aliasIdentity?.key === canonical.key
    ) continue;
    const existing = byAlias.get(alias);
    if (!existing) {
      const next = { ...raw, alias, canonicalKey: canonical.key };
      byAlias.set(alias, next);
      records.push(next);
      continue;
    }
    if (existing.canonicalKey !== canonical.key) {
      issues.push(collisionIssue(alias, existing.canonicalKey, canonical.key));
    }
  }
  const registry = {
    version: 1 as const,
    records,
    issues: dedupeIssues(issues),
  };
  return { registry, issues: registry.issues };
}

export function syncMediaIdentityAliases(
  scope: LocalOwnerScope,
  items: readonly MediaItem[],
  storage?: PersonalStorageLike | null,
): { writeResult: StorageWriteResult; registry?: MediaIdentityAliasRegistry } {
  const read = readMediaIdentityAliasRegistry(scope, storage);
  if (
    read.status !== "missing"
    && read.status !== "valid"
  ) {
    return {
      writeResult: {
        ok: false,
        code: "verification_failed",
        message: "Media identity alias registry recovery gerektiriyor.",
        recoverable: true,
      },
    };
  }
  const generated = aliasesForMediaItems(items);
  const update = updateMediaIdentityAliases(
    read.status === "valid" ? read.data : emptyMediaIdentityAliasRegistry(),
    generated.records,
    generated.issues,
  );
  const writeResult = writeMediaIdentityAliasRegistry(scope, update.registry, storage);
  return { writeResult, registry: writeResult.ok ? update.registry : undefined };
}

export function resolveCanonicalMediaAlias(
  registry: MediaIdentityAliasRegistry,
  inputKey: string,
): string | null {
  const alias = normalizeAlias(inputKey);
  const resolved = registry.records.find((entry) => entry.alias === alias)?.canonicalKey;
  if (resolved) return resolved;
  const direct = parseCanonicalMediaKeyV2(inputKey);
  return direct?.key ?? null;
}

export type MergedIdentityAliasResult =
  | { ok: true; registry: MediaIdentityAliasRegistry }
  | { ok: false; code: "alias_collision" | "alias_chain"; message: string };

function issueMentionsAlias(issue: MediaIdentityIssue, alias: string): boolean {
  return issue.code === "IDENTITY_ALIAS_COLLISION"
    && issue.evidence.toLowerCase().endsWith(normalizeAlias(alias));
}

export function buildMergedIdentityAliases(args: {
  current: MediaIdentityAliasRegistry;
  selectedItems: readonly MediaItem[];
  canonicalKey: string;
  createdAt?: string;
}): MergedIdentityAliasResult {
  const canonical = parseCanonicalMediaKeyV2(args.canonicalKey);
  if (!canonical) {
    return { ok: false, code: "alias_chain", message: "Merge canonical identity gecersiz." };
  }
  const createdAt = args.createdAt ?? new Date().toISOString();
  const selectedKeys = new Set(
    args.selectedItems
      .map(getCanonicalMediaKeyV2)
      .filter((key): key is string => Boolean(key)),
  );
  const proposed = new Map<string, MediaIdentityAliasRecord>();
  const add = (record: MediaIdentityAliasRecord) => {
    const alias = normalizeAlias(record.alias);
    if (normalizeAlias(canonical.key) === alias) return;
    proposed.set(alias, { ...record, alias, canonicalKey: canonical.key });
  };
  for (const item of args.selectedItems) {
    add({
      alias: getLegacyCanonicalMediaKey(item),
      canonicalKey: canonical.key,
      aliasType: "legacy-canonical-key",
      createdAt,
    });
    add({
      alias: item.id,
      canonicalKey: canonical.key,
      aliasType: "record-id",
      createdAt,
    });
    const identityKey = getCanonicalMediaKeyV2(item);
    if (identityKey && identityKey !== canonical.key) {
      add({
        alias: identityKey,
        canonicalKey: canonical.key,
        aliasType: "merged-canonical-key",
        createdAt,
      });
    }
  }
  for (const alias of proposed.keys()) {
    if (args.current.issues.some((entry) => issueMentionsAlias(entry, alias))) {
      return {
        ok: false,
        code: "alias_collision",
        message: `Collision issue tasiyan alias merge edilemez: ${alias}`,
      };
    }
  }

  const records = new Map<string, MediaIdentityAliasRecord>();
  for (const current of args.current.records) {
    const alias = normalizeAlias(current.alias);
    const shouldFlatten = selectedKeys.has(current.canonicalKey);
    const proposedRecord = proposed.get(alias);
    if (
      proposedRecord
      && !shouldFlatten
      && current.canonicalKey !== canonical.key
    ) {
      return {
        ok: false,
        code: "alias_collision",
        message: `Alias baska bir identity'ye ait: ${alias}`,
      };
    }
    records.set(alias, shouldFlatten
      ? { ...current, canonicalKey: canonical.key }
      : current);
  }
  for (const [alias, record] of proposed) records.set(alias, record);
  const registry: MediaIdentityAliasRegistry = {
    version: 1,
    records: [...records.values()],
    issues: args.current.issues.filter(
      (entry) => !(
        entry.code === "IDENTITY_EXACT_COLLISION"
        && entry.recordId
        && args.selectedItems.some((item) => item.id === entry.recordId)
      ),
    ),
  };
  const decoded = mediaIdentityAliasRegistryCodec(registry);
  return decoded.ok
    ? { ok: true, registry: decoded.value }
    : { ok: false, code: "alias_chain", message: decoded.message };
}
