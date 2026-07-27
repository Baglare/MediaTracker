import {
  getCanonicalMediaIdentity,
  getCanonicalMediaKeyV2,
  getLegacyCanonicalMediaKey,
} from "./media-identity";
import type { MediaIdentityAliasRegistry } from "./media-identity-aliases";
import type { ProgressLog, MediaItem } from "./types";

export const DUPLICATE_SCAN_VERSION = 1 as const;

export type DuplicateClassification = "exact" | "strong" | "probable";

export type DuplicateEvidenceCode =
  | "EXACT_CANONICAL_IDENTITY"
  | "VERIFIED_EXTERNAL_ID_MATCH"
  | "LEGACY_ALIAS_MATCH"
  | "RECORD_ALIAS_MATCH"
  | "NORMALIZED_TITLE_MATCH"
  | "ALTERNATIVE_TITLE_MATCH"
  | "RELEASE_YEAR_MATCH"
  | "RELEASE_YEAR_CONFLICT"
  | "MEDIA_TYPE_MATCH"
  | "MEDIA_TYPE_CONFLICT"
  | "CREATOR_MATCH"
  | "SEASON_CONTEXT_MATCH"
  | "SOURCE_NAMESPACE_CONFLICT"
  | "MANUAL_IDENTITY_MATCH"
  | "COVER_ONLY_MATCH";

export interface DuplicateEvidence {
  code: DuplicateEvidenceCode;
  weight: number;
  description: string;
  recordIds: string[];
  values?: string[];
}

export interface DuplicateCandidateGroup {
  id: string;
  ownerScope: string;
  recordIds: string[];
  classification: DuplicateClassification;
  confidence: number;
  evidence: DuplicateEvidence[];
  scanVersion: 1;
  fingerprint: string;
  evidenceFingerprint: string;
}

export interface SuppressedDuplicateCandidate {
  recordIds: string[];
  evidence: DuplicateEvidence[];
  reason: "type_conflict" | "namespace_conflict" | "year_conflict" | "insufficient_evidence";
}

export interface DuplicateScanResult {
  candidates: DuplicateCandidateGroup[];
  suppressed: SuppressedDuplicateCandidate[];
  scannedRecordCount: number;
  scanVersion: 1;
}

export interface DuplicateCandidateSummary {
  label: "Kesin kimlik eşleşmesi" | "Güçlü aday" | "Olası aday";
  recordCount: number;
  description: string;
}

export interface DuplicateMergePreview {
  candidateId: string;
  recordIds: string[];
  blockedReasons: string[];
  relationships: {
    progressLogCounts: Record<string, number>;
    groupMemberships: Record<string, string[]>;
    xpCompatibilityKeys: Record<string, string>;
  };
}

interface PairAnalysis {
  left: string;
  right: string;
  classification: DuplicateClassification | "suppressed";
  confidence: number;
  evidence: DuplicateEvidence[];
  suppressedReason?: SuppressedDuplicateCandidate["reason"];
}

const CLASSIFICATION_ORDER: Record<DuplicateClassification, number> = {
  exact: 0,
  strong: 1,
  probable: 2,
};

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

export function normalizeDuplicateTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCreator(value: string): string {
  return normalizeDuplicateTitle(value);
}

function alternativeTitles(item: MediaItem): string[] {
  return sortedUnique(
    [item.originalTitle, item.nativeTitle]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map(normalizeDuplicateTitle)
      .filter(Boolean),
  );
}

function verifiedExternalIdentifiers(item: MediaItem): string[] {
  const values: string[] = [];
  const imdbId = item.externalSource === "omdb" ? item.externalId : item.imdbId;
  if (typeof imdbId === "string" && /^tt\d{5,12}$/i.test(imdbId.trim())) {
    values.push(`imdb:${imdbId.trim().toLowerCase()}`);
  }
  for (const isbn of item.isbn ?? []) {
    const normalized = isbn.toUpperCase().replace(/[^0-9X]/g, "");
    if (/^(?:\d{9}[\dX]|\d{13})$/.test(normalized)) values.push(`isbn:${normalized}`);
  }
  return sortedUnique(values);
}

function pairKey(left: string, right: string): string {
  return sortedUnique([left, right]).join("\u0000");
}

function addBucket(
  index: Map<string, Set<string>>,
  key: string | null | undefined,
  recordId: string,
) {
  if (!key) return;
  const bucket = index.get(key) ?? new Set<string>();
  bucket.add(recordId);
  index.set(key, bucket);
}

function addBucketPairs(bucket: Set<string>, pairs: Set<string>) {
  const ids = sortedUnique([...bucket]);
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      pairs.add(pairKey(ids[left], ids[right]));
    }
  }
}

function evidence(
  code: DuplicateEvidenceCode,
  weight: number,
  description: string,
  items: readonly MediaItem[],
  values?: string[],
): DuplicateEvidence {
  return {
    code,
    weight,
    description,
    recordIds: sortedUnique(items.map((item) => item.id)),
    ...(values && values.length > 0 ? { values: sortedUnique(values) } : {}),
  };
}

function hasAliasCollision(registry: MediaIdentityAliasRegistry, alias: string): boolean {
  const normalized = alias.trim().toLowerCase();
  return registry.issues.some(
    (entry) => entry.code === "IDENTITY_ALIAS_COLLISION"
      && entry.evidence.toLowerCase().endsWith(normalized),
  );
}

function aliasEvidence(
  left: MediaItem,
  right: MediaItem,
  registry: MediaIdentityAliasRegistry,
): DuplicateEvidence[] {
  const leftKey = getCanonicalMediaKeyV2(left);
  const rightKey = getCanonicalMediaKeyV2(right);
  if (!leftKey || !rightKey || leftKey === rightKey) return [];
  const leftLegacy = getLegacyCanonicalMediaKey(left).toLowerCase();
  const rightLegacy = getLegacyCanonicalMediaKey(right).toLowerCase();
  const leftRecord = left.id.toLowerCase();
  const rightRecord = right.id.toLowerCase();
  const found: DuplicateEvidence[] = [];
  for (const alias of registry.records) {
    if (hasAliasCollision(registry, alias.alias)) continue;
    const relates =
      (alias.canonicalKey === leftKey
        && (alias.alias === rightLegacy || alias.alias === rightRecord))
      || (alias.canonicalKey === rightKey
        && (alias.alias === leftLegacy || alias.alias === leftRecord));
    if (!relates) continue;
    found.push(evidence(
      alias.aliasType === "record-id" ? "RECORD_ALIAS_MATCH" : "LEGACY_ALIAS_MATCH",
      80,
      alias.aliasType === "record-id"
        ? "Önceki local record kimliği V2 identity ile doğrulanmış biçimde eşleşiyor."
        : "Compatibility alias iki farklı provider kimliğini aynı V2 kayda bağlıyor.",
      [left, right],
    ));
  }
  return found;
}

function hasShowSeasonConflict(left: MediaItem, right: MediaItem): boolean {
  const leftIdentity = getCanonicalMediaIdentity(left);
  const rightIdentity = getCanonicalMediaIdentity(right);
  if (
    leftIdentity?.source === "tvmaze"
    && rightIdentity?.source === "tvmaze"
    && leftIdentity.namespace !== rightIdentity.namespace
  ) return true;
  return (
    left.seriesGroupId !== undefined
    && left.seriesGroupId === right.seriesGroupId
    && (
      left.seriesRelationType === "season"
      || right.seriesRelationType === "season"
    )
    && left.seasonNumber !== right.seasonNumber
  );
}

function hasSourceNamespaceConflict(left: MediaItem, right: MediaItem): boolean {
  const leftIdentity = getCanonicalMediaIdentity(left);
  const rightIdentity = getCanonicalMediaIdentity(right);
  if (!leftIdentity || !rightIdentity) return false;
  return leftIdentity.source === rightIdentity.source
    && leftIdentity.namespace !== rightIdentity.namespace;
}

export function buildDuplicateEvidence(
  left: MediaItem,
  right: MediaItem,
  aliases: MediaIdentityAliasRegistry,
): DuplicateEvidence[] {
  const result: DuplicateEvidence[] = [];
  const leftKey = getCanonicalMediaKeyV2(left);
  const rightKey = getCanonicalMediaKeyV2(right);
  if (leftKey && leftKey === rightKey) {
    result.push(evidence(
      "EXACT_CANONICAL_IDENTITY",
      100,
      "Kayıtlar aynı doğrulanmış Canonical Identity V2 anahtarını taşıyor.",
      [left, right],
      [leftKey],
    ));
    if (left.identity?.source === "manual") {
      result.push(evidence(
        "MANUAL_IDENTITY_MATCH",
        100,
        "Kayıtlar aynı değişmez manuel UUID kimliğini taşıyor.",
        [left, right],
      ));
    }
  }

  const verifiedMatches = verifiedExternalIdentifiers(left)
    .filter((identifier) => verifiedExternalIdentifiers(right).includes(identifier));
  if (verifiedMatches.length > 0) {
    result.push(evidence(
      "VERIFIED_EXTERNAL_ID_MATCH",
      85,
      "Kayıtlar aynı doğrulanmış IMDb veya ISBN kimliğini taşıyor.",
      [left, right],
      verifiedMatches,
    ));
  }
  result.push(...aliasEvidence(left, right, aliases));

  const leftTitle = normalizeDuplicateTitle(left.title);
  const rightTitle = normalizeDuplicateTitle(right.title);
  if (leftTitle && leftTitle === rightTitle) {
    result.push(evidence(
      "NORMALIZED_TITLE_MATCH",
      45,
      "Temel noktalama ve boşluk farkları kaldırıldığında başlıklar eşleşiyor.",
      [left, right],
      [leftTitle],
    ));
  } else {
    const leftAlternatives = alternativeTitles(left);
    const rightAlternatives = alternativeTitles(right);
    const alternativeMatch = [
      ...leftAlternatives.filter((title) => title === rightTitle),
      ...rightAlternatives.filter((title) => title === leftTitle),
      ...leftAlternatives.filter((title) => rightAlternatives.includes(title)),
    ];
    if (alternativeMatch.length > 0) {
      result.push(evidence(
        "ALTERNATIVE_TITLE_MATCH",
        40,
        "Bir kaydın doğrulanmış alternatif/native başlığı diğer kayıtla eşleşiyor.",
        [left, right],
        alternativeMatch,
      ));
    }
  }

  if (left.releaseYear !== undefined && right.releaseYear !== undefined) {
    result.push(left.releaseYear === right.releaseYear
      ? evidence(
          "RELEASE_YEAR_MATCH",
          20,
          "Yayın yılları eşleşiyor.",
          [left, right],
          [String(left.releaseYear)],
        )
      : evidence(
          "RELEASE_YEAR_CONFLICT",
          -40,
          "Yayın yılları çelişiyor; remake veya farklı eser olabilir.",
          [left, right],
          [String(left.releaseYear), String(right.releaseYear)],
        ));
  }

  result.push(left.type === right.type
    ? evidence(
        "MEDIA_TYPE_MATCH",
        25,
        "Medya türleri eşleşiyor.",
        [left, right],
        [left.type],
      )
    : evidence(
        "MEDIA_TYPE_CONFLICT",
        -100,
        "Medya türleri çelişiyor; uyarlamalar duplicate kabul edilmedi.",
        [left, right],
        [left.type, right.type],
      ));

  const creatorMatches = (left.authors ?? [])
    .map(normalizeCreator)
    .filter((creator) => creator && (right.authors ?? []).map(normalizeCreator).includes(creator));
  if (creatorMatches.length > 0) {
    result.push(evidence(
      "CREATOR_MATCH",
      15,
      "Yazar/üretici metadata'sı eşleşiyor.",
      [left, right],
      creatorMatches,
    ));
  }

  if (
    left.seriesGroupId
    && left.seriesGroupId === right.seriesGroupId
    && left.seasonNumber !== undefined
    && left.seasonNumber === right.seasonNumber
  ) {
    result.push(evidence(
      "SEASON_CONTEXT_MATCH",
      15,
      "Seri grubu ve sezon bağlamı eşleşiyor.",
      [left, right],
      [String(left.seasonNumber)],
    ));
  }

  if (hasShowSeasonConflict(left, right) || hasSourceNamespaceConflict(left, right)) {
    result.push(evidence(
      "SOURCE_NAMESPACE_CONFLICT",
      -100,
      "Provider namespace veya show/season bağlamı farklı kayıtları gösteriyor.",
      [left, right],
    ));
  }

  if (
    left.coverImage
    && left.coverImage === right.coverImage
    && !left.coverImage.startsWith("/placeholders/")
  ) {
    result.push(evidence(
      "COVER_ONLY_MATCH",
      0,
      "Kapak URL'si eşleşiyor; bu sinyal tek başına aday oluşturmaz.",
      [left, right],
    ));
  }
  return result;
}

export function classifyDuplicateGroup(evidenceList: readonly DuplicateEvidence[]): {
  classification: DuplicateClassification | "suppressed";
  confidence: number;
  reason?: SuppressedDuplicateCandidate["reason"];
} {
  const codes = new Set(evidenceList.map((entry) => entry.code));
  if (codes.has("EXACT_CANONICAL_IDENTITY")) {
    return { classification: "exact", confidence: 1 };
  }
  if (codes.has("MEDIA_TYPE_CONFLICT")) {
    return { classification: "suppressed", confidence: 0, reason: "type_conflict" };
  }
  if (codes.has("SOURCE_NAMESPACE_CONFLICT")) {
    return { classification: "suppressed", confidence: 0, reason: "namespace_conflict" };
  }
  const strong =
    codes.has("VERIFIED_EXTERNAL_ID_MATCH")
    || codes.has("LEGACY_ALIAS_MATCH")
    || codes.has("RECORD_ALIAS_MATCH");
  if (strong) {
    return {
      classification: "strong",
      confidence: codes.has("RELEASE_YEAR_CONFLICT") ? 0.82 : 0.92,
    };
  }
  const titleMatch =
    codes.has("NORMALIZED_TITLE_MATCH")
    || codes.has("ALTERNATIVE_TITLE_MATCH");
  if (codes.has("RELEASE_YEAR_CONFLICT") && titleMatch) {
    return { classification: "suppressed", confidence: 0, reason: "year_conflict" };
  }
  if (titleMatch && codes.has("MEDIA_TYPE_MATCH")) {
    const score = evidenceList.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
    return {
      classification: "probable",
      confidence: Math.min(0.88, Math.max(0.65, score / 110)),
    };
  }
  return {
    classification: "suppressed",
    confidence: 0,
    reason: "insufficient_evidence",
  };
}

function mergeEvidence(entries: readonly DuplicateEvidence[]): DuplicateEvidence[] {
  const grouped = new Map<string, DuplicateEvidence>();
  for (const entry of entries) {
    const key = `${entry.code}:${entry.description}`;
    const current = grouped.get(key);
    grouped.set(key, current
      ? {
          ...current,
          recordIds: sortedUnique([...current.recordIds, ...entry.recordIds]),
          values: sortedUnique([...(current.values ?? []), ...(entry.values ?? [])]),
        }
      : {
          ...entry,
          recordIds: sortedUnique(entry.recordIds),
          values: entry.values ? sortedUnique(entry.values) : undefined,
        });
  }
  return [...grouped.values()].sort((left, right) => left.code.localeCompare(right.code, "en"));
}

function evidenceFingerprint(evidenceList: readonly DuplicateEvidence[]): string {
  const stable = evidenceList
    .map((entry) => ({
      code: entry.code,
      recordIds: sortedUnique(entry.recordIds),
      values: sortedUnique(entry.values ?? []),
    }))
    .sort((left, right) =>
      left.code.localeCompare(right.code, "en")
      || JSON.stringify(left.recordIds).localeCompare(JSON.stringify(right.recordIds), "en")
      || JSON.stringify(left.values).localeCompare(JSON.stringify(right.values), "en"));
  return `ev:v1:${stableHash(JSON.stringify(stable))}`;
}

export function buildDuplicateCandidateFingerprint(args: {
  classification: DuplicateClassification;
  recordIds: readonly string[];
  evidence: readonly DuplicateEvidence[];
}): { fingerprint: string; evidenceFingerprint: string } {
  const recordsHash = stableHash(JSON.stringify(sortedUnique(args.recordIds)));
  const evidenceId = evidenceFingerprint(args.evidence);
  return {
    fingerprint: `dup:v1:${args.classification}:${recordsHash}:${evidenceId.slice(-8)}`,
    evidenceFingerprint: evidenceId,
  };
}

function connectedComponents(edges: readonly PairAnalysis[]): string[][] {
  const parent = new Map<string, string>();
  const find = (value: string): string => {
    const current = parent.get(value) ?? value;
    if (current === value) {
      parent.set(value, value);
      return value;
    }
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort((a, b) => a.localeCompare(b, "en"));
    parent.set(second, first);
  };
  for (const edge of edges) union(edge.left, edge.right);
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()].map(sortedUnique);
}

function pairsForComponent(
  edges: readonly PairAnalysis[],
  recordIds: readonly string[],
): PairAnalysis[] {
  const ids = new Set(recordIds);
  return edges.filter((edge) => ids.has(edge.left) && ids.has(edge.right));
}

function addAliasPairs(
  items: readonly MediaItem[],
  aliases: MediaIdentityAliasRegistry,
  pairs: Set<string>,
) {
  const canonicalIndex = new Map<string, Set<string>>();
  const legacyIndex = new Map<string, Set<string>>();
  const recordIndex = new Map<string, Set<string>>();
  for (const item of items) {
    addBucket(canonicalIndex, getCanonicalMediaKeyV2(item), item.id);
    addBucket(legacyIndex, getLegacyCanonicalMediaKey(item).toLowerCase(), item.id);
    addBucket(recordIndex, item.id.toLowerCase(), item.id);
  }
  for (const alias of aliases.records) {
    if (hasAliasCollision(aliases, alias.alias)) continue;
    const targets = canonicalIndex.get(alias.canonicalKey);
    const sources = alias.aliasType === "record-id"
      ? recordIndex.get(alias.alias)
      : legacyIndex.get(alias.alias);
    if (!targets || !sources) continue;
    for (const target of targets) {
      for (const source of sources) {
        if (target !== source) pairs.add(pairKey(target, source));
      }
    }
  }
}

export function scanDuplicateCandidates(
  items: readonly MediaItem[],
  aliases: MediaIdentityAliasRegistry,
  options: { ownerScope: string },
): DuplicateScanResult {
  const byId = new Map(items.map((item) => [item.id, item]));
  const identityIndex = new Map<string, Set<string>>();
  const externalIndex = new Map<string, Set<string>>();
  const titleIndex = new Map<string, Set<string>>();
  const pairs = new Set<string>();

  for (const item of items) {
    addBucket(identityIndex, getCanonicalMediaKeyV2(item), item.id);
    for (const identifier of verifiedExternalIdentifiers(item)) {
      addBucket(externalIndex, identifier, item.id);
    }
    addBucket(titleIndex, normalizeDuplicateTitle(item.title), item.id);
    for (const title of alternativeTitles(item)) addBucket(titleIndex, title, item.id);
  }
  for (const bucket of identityIndex.values()) addBucketPairs(bucket, pairs);
  for (const bucket of externalIndex.values()) addBucketPairs(bucket, pairs);
  for (const bucket of titleIndex.values()) addBucketPairs(bucket, pairs);
  addAliasPairs(items, aliases, pairs);

  const analyses: PairAnalysis[] = [];
  for (const key of [...pairs].sort((left, right) => left.localeCompare(right, "en"))) {
    const [leftId, rightId] = key.split("\u0000");
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (!left || !right) continue;
    const pairEvidence = buildDuplicateEvidence(left, right, aliases);
    const classified = classifyDuplicateGroup(pairEvidence);
    analyses.push({
      left: leftId,
      right: rightId,
      classification: classified.classification,
      confidence: classified.confidence,
      evidence: pairEvidence,
      suppressedReason: classified.reason,
    });
  }

  const candidates: DuplicateCandidateGroup[] = [];
  for (const classification of ["exact", "strong", "probable"] as const) {
    const edges = analyses.filter((entry) => entry.classification === classification);
    for (const recordIds of connectedComponents(edges)) {
      const componentEdges = pairsForComponent(edges, recordIds);
      const groupEvidence = mergeEvidence(componentEdges.flatMap((entry) => entry.evidence));
      const ids = buildDuplicateCandidateFingerprint({
        classification,
        recordIds,
        evidence: groupEvidence,
      });
      candidates.push({
        id: ids.fingerprint,
        ownerScope: options.ownerScope,
        recordIds,
        classification,
        confidence: Math.max(...componentEdges.map((entry) => entry.confidence)),
        evidence: groupEvidence,
        scanVersion: DUPLICATE_SCAN_VERSION,
        ...ids,
      });
    }
  }
  candidates.sort((left, right) =>
    CLASSIFICATION_ORDER[left.classification] - CLASSIFICATION_ORDER[right.classification]
    || right.confidence - left.confidence
    || left.fingerprint.localeCompare(right.fingerprint, "en"));

  return {
    candidates,
    suppressed: analyses
      .filter((entry) => entry.classification === "suppressed")
      .map((entry) => ({
        recordIds: sortedUnique([entry.left, entry.right]),
        evidence: entry.evidence,
        reason: entry.suppressedReason ?? "insufficient_evidence",
      })),
    scannedRecordCount: items.length,
    scanVersion: DUPLICATE_SCAN_VERSION,
  };
}

export function summarizeDuplicateCandidate(
  candidate: DuplicateCandidateGroup,
): DuplicateCandidateSummary {
  if (candidate.classification === "exact") {
    return {
      label: "Kesin kimlik eşleşmesi",
      recordCount: candidate.recordIds.length,
      description: "Aynı doğrulanmış Canonical Identity V2 birden fazla local kayıtta bulunuyor.",
    };
  }
  if (candidate.classification === "strong") {
    return {
      label: "Güçlü aday",
      recordCount: candidate.recordIds.length,
      description: "Doğrulanmış external identifier veya compatibility alias eşleşiyor.",
    };
  }
  return {
    label: "Olası aday",
    recordCount: candidate.recordIds.length,
    description: "Başlık ve güvenli metadata sinyalleri kullanıcı incelemesini gerektiriyor.",
  };
}

export function buildDuplicateMergePreview(
  candidate: DuplicateCandidateGroup,
  items: readonly MediaItem[],
  logs: readonly ProgressLog[],
): DuplicateMergePreview {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const progressLogCounts: Record<string, number> = {};
  const groupMemberships: Record<string, string[]> = {};
  const xpCompatibilityKeys: Record<string, string> = {};
  for (const recordId of candidate.recordIds) {
    const item = itemById.get(recordId);
    progressLogCounts[recordId] = logs.filter((log) => log.mediaId === recordId).length;
    groupMemberships[recordId] = item?.seriesGroupId
      ? [item.seriesGroupId, item.seriesGroupTitle].filter(
          (value): value is string => typeof value === "string" && value.length > 0,
        )
      : [];
    if (item) xpCompatibilityKeys[recordId] = getLegacyCanonicalMediaKey(item);
  }
  return {
    candidateId: candidate.id,
    recordIds: [...candidate.recordIds],
    blockedReasons: ["MERGE_EXECUTOR_NOT_AVAILABLE", "SURVIVOR_NOT_SELECTED"],
    relationships: {
      progressLogCounts,
      groupMemberships,
      xpCompatibilityKeys,
    },
  };
}
