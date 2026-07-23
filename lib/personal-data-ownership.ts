import {
  DEFAULT_AI_PREFERENCES,
  aiFeedbackCodec,
  aiPreferencesCodec,
  aiSessionCodec,
  readAiFeedbackState,
  readAiPreferencesState,
  readAiSessionState,
  writeAiFeedbackState,
  writeAiPreferencesState,
  writeAiSessionState,
  type AiFeedbackLocalState,
  type AiPreferencesLocalState,
  type AiSessionLocalState,
} from "./ai/local-state";
import {
  CUSTOM_THEMES_STORAGE_KEY,
  customThemeCollectionCodec,
  readScopedCustomThemes,
  writeScopedCustomThemes,
  type CustomThemeCollection,
} from "./personalization/custom-themes";
import {
  readOwnerThemeSelection,
  writeOwnerThemeSelection,
} from "./personalization/owner-theme-selection";
import { normalizeThemeSelection } from "./personalization/validation";
import {
  PROFILE_PREFS_STORAGE_KEY,
  profilePreferencesCodec,
  readScopedProfilePreferences,
  writeScopedProfilePreferences,
  type ProfilePreferences,
} from "./profile-preferences";
import {
  GUEST_OWNER_SCOPE,
  type LocalOwnerScope,
} from "./local-owner-scope";
import type { PersonalStorageLike } from "./personal-data-storage";

export type LegacyPersonalDomain = "profile" | "themes" | "ai";
export type PersonalOwnershipDecision =
  | "assigned_to_user"
  | "assigned_to_guest"
  | "deferred"
  | "backup_only";

export interface LegacyPersonalDataCandidate {
  domain: LegacyPersonalDomain;
  fingerprint: string;
  recordCount: number;
  updatedAt?: string;
  hasSensitiveConsent?: boolean;
  destinationHasData: boolean;
  deferred?: boolean;
}

export interface PersonalOwnershipDecisionRecord {
  version: 1;
  domain: LegacyPersonalDomain;
  sourceFingerprint: string;
  decision: PersonalOwnershipDecision;
  targetScope?: string;
  decidedAt: string;
}

const LEGACY_AI_KEYS = {
  settings: "media-tracker-ai-settings",
  sessions: "media-tracker-ai-sessions",
  active: "media-tracker-ai-active-session",
  dismissed: "media-tracker-ai-dismissed-feedback",
  toggles: "media-tracker-ai-data-toggles",
  advisor: "media-tracker-ai-advisor-prefs",
  recommendation: "media-tracker-ai-recommendation-feedback",
} as const;
const LEGACY_APPEARANCE_KEY = "mediaTracker:appearancePreferences:v3";

function parse(raw: string | null): unknown {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function fingerprint(raw: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function markerKey(
  domain: LegacyPersonalDomain,
  scope: LocalOwnerScope,
  sourceFingerprint: string,
): string {
  return `mediaTracker:personalOwnership:v1:${domain}:${scope.storageKey}:${sourceFingerprint}`;
}

function backupKey(domain: LegacyPersonalDomain, sourceFingerprint: string): string {
  return `mediaTracker:personalOwnershipBackup:v1:${domain}:${sourceFingerprint}`;
}

function rawBundle(domain: LegacyPersonalDomain, storage: PersonalStorageLike): string | null {
  const pairs: Array<[string, string]> = [];
  const add = (key: string) => {
    const raw = storage.getItem(key);
    if (raw !== null) pairs.push([key, raw]);
  };
  if (domain === "profile") add(PROFILE_PREFS_STORAGE_KEY);
  if (domain === "themes") {
    add(CUSTOM_THEMES_STORAGE_KEY);
    add(LEGACY_APPEARANCE_KEY);
  }
  if (domain === "ai") Object.values(LEGACY_AI_KEYS).forEach(add);
  return pairs.length > 0 ? JSON.stringify(pairs) : null;
}

function backupRaw(
  domain: LegacyPersonalDomain,
  sourceFingerprint: string,
  raw: string,
  storage: PersonalStorageLike,
): boolean {
  const key = backupKey(domain, sourceFingerprint);
  try {
    const current = storage.getItem(key);
    if (current === null) storage.setItem(key, raw);
    return storage.getItem(key) === raw;
  } catch {
    return false;
  }
}

function quarantineLegacy(
  domain: LegacyPersonalDomain,
  raw: string,
  storage: PersonalStorageLike,
): void {
  const key = `mediaTracker:quarantine:personal-legacy:${domain}:${Date.now()}`;
  try {
    storage.setItem(key, JSON.stringify({
      format: "mediatracker-personal-quarantine",
      version: 1,
      domain,
      source: "legacy-global",
      capturedAt: new Date().toISOString(),
      message: "Legacy personal payload codec dogrulamasini gecemedi.",
      raw,
    }));
  } catch {
    // Quarantine failure never removes or overwrites the legacy source.
  }
}

function readMarker(
  domain: LegacyPersonalDomain,
  scope: LocalOwnerScope,
  sourceFingerprint: string,
  storage: PersonalStorageLike,
): PersonalOwnershipDecisionRecord | null {
  const value = parse(storage.getItem(markerKey(domain, scope, sourceFingerprint)));
  if (
    !value
    || typeof value !== "object"
    || (value as { version?: unknown }).version !== 1
    || (value as { domain?: unknown }).domain !== domain
    || (value as { sourceFingerprint?: unknown }).sourceFingerprint !== sourceFingerprint
  ) return null;
  return value as PersonalOwnershipDecisionRecord;
}

function writeMarker(
  record: PersonalOwnershipDecisionRecord,
  scope: LocalOwnerScope,
  storage: PersonalStorageLike,
): boolean {
  try {
    const key = markerKey(record.domain, scope, record.sourceFingerprint);
    const raw = JSON.stringify(record);
    storage.setItem(key, raw);
    return storage.getItem(key) === raw;
  } catch {
    return false;
  }
}

function legacyProfile(storage: PersonalStorageLike): ProfilePreferences | null {
  const raw = storage.getItem(PROFILE_PREFS_STORAGE_KEY);
  if (raw === null) return null;
  const decoded = profilePreferencesCodec(parse(raw));
  return decoded.ok ? decoded.value : null;
}

function legacyThemes(storage: PersonalStorageLike): {
  collection: CustomThemeCollection;
  selection: ReturnType<typeof normalizeThemeSelection> | null;
} | null {
  const raw = storage.getItem(CUSTOM_THEMES_STORAGE_KEY);
  if (raw === null) return null;
  const decoded = customThemeCollectionCodec(parse(raw));
  if (!decoded.ok) return null;
  const appearance = parse(storage.getItem(LEGACY_APPEARANCE_KEY));
  const theme = appearance && typeof appearance === "object"
    ? normalizeThemeSelection((appearance as { theme?: unknown }).theme)
    : null;
  return {
    collection: decoded.value,
    selection: theme?.kind === "custom" ? theme : null,
  };
}

function legacyAi(storage: PersonalStorageLike): {
  sessions: AiSessionLocalState;
  feedback: AiFeedbackLocalState;
  preferences: AiPreferencesLocalState;
} | null {
  const rawBundleValue = rawBundle("ai", storage);
  if (!rawBundleValue) return null;
  for (const key of Object.values(LEGACY_AI_KEYS)) {
    const raw = storage.getItem(key);
    if (raw !== null && parse(raw) === undefined) return null;
  }
  const settings = parse(storage.getItem(LEGACY_AI_KEYS.settings));
  const toggles = parse(storage.getItem(LEGACY_AI_KEYS.toggles));
  const advisor = parse(storage.getItem(LEGACY_AI_KEYS.advisor));
  const preferencesDecoded = aiPreferencesCodec({
    version: 1,
    settings: settings ?? DEFAULT_AI_PREFERENCES.settings,
    dataToggles: toggles ?? DEFAULT_AI_PREFERENCES.dataToggles,
    scopeMode: advisor && typeof advisor === "object"
      ? (advisor as { scopeMode?: unknown }).scopeMode
      : "mixed",
    researchMode: advisor && typeof advisor === "object"
      ? (advisor as { researchMode?: unknown }).researchMode
      : "library-only",
  });
  const sessionsDecoded = aiSessionCodec({
    version: 1,
    sessions: parse(storage.getItem(LEGACY_AI_KEYS.sessions)) ?? [],
    activeSession: parse(storage.getItem(LEGACY_AI_KEYS.active)),
  });
  const feedbackDecoded = aiFeedbackCodec({
    version: 1,
    dismissedSignals: parse(storage.getItem(LEGACY_AI_KEYS.dismissed)) ?? {},
    recommendationEvents: parse(storage.getItem(LEGACY_AI_KEYS.recommendation)) ?? [],
  });
  if (!preferencesDecoded.ok || !sessionsDecoded.ok || !feedbackDecoded.ok) return null;
  return {
    preferences: preferencesDecoded.value,
    sessions: sessionsDecoded.value,
    feedback: feedbackDecoded.value,
  };
}

function destinationHasData(
  domain: LegacyPersonalDomain,
  scope: LocalOwnerScope,
  storage: PersonalStorageLike,
): boolean {
  if (domain === "profile") return readScopedProfilePreferences(scope, storage).status === "valid";
  if (domain === "themes") {
    return readScopedCustomThemes(scope, storage).status === "valid"
      || readOwnerThemeSelection(scope, storage).status === "valid";
  }
  return readAiSessionState(scope, storage).status === "valid"
    || readAiFeedbackState(scope, storage).status === "valid"
    || readAiPreferencesState(scope, storage).status === "valid";
}

function legacyDomainIsValid(
  domain: LegacyPersonalDomain,
  storage: PersonalStorageLike,
): boolean {
  if (domain === "profile") return legacyProfile(storage) !== null;
  if (domain === "themes") return legacyThemes(storage) !== null;
  return legacyAi(storage) !== null;
}

function migrateDomain(
  domain: LegacyPersonalDomain,
  scope: LocalOwnerScope,
  storage: PersonalStorageLike,
  resetNoteConsent: boolean,
): boolean {
  if (destinationHasData(domain, scope, storage)) return false;
  if (domain === "profile") {
    const value = legacyProfile(storage);
    return value ? writeScopedProfilePreferences(scope, value, storage).ok : false;
  }
  if (domain === "themes") {
    const value = legacyThemes(storage);
    if (!value) return false;
    const catalog = writeScopedCustomThemes(scope, value.collection, storage);
    if (!catalog.ok) return false;
    return writeOwnerThemeSelection(scope, value.selection, storage).ok;
  }
  const value = legacyAi(storage);
  if (!value) return false;
  const preferences = resetNoteConsent
    ? {
        ...value.preferences,
        settings: { ...value.preferences.settings, usePersonalNotes: false },
        dataToggles: { ...value.preferences.dataToggles, notes: false },
      }
    : value.preferences;
  return writeAiPreferencesState(scope, preferences, storage).ok
    && writeAiFeedbackState(scope, value.feedback, storage).ok
    && writeAiSessionState(scope, value.sessions, storage).ok;
}

export function migrateLegacyPersonalDomainToGuest(
  domain: LegacyPersonalDomain,
  storage: PersonalStorageLike,
): boolean {
  const raw = rawBundle(domain, storage);
  if (!raw) return false;
  const sourceFingerprint = fingerprint(raw);
  if (readMarker(domain, GUEST_OWNER_SCOPE, sourceFingerprint, storage)) return false;
  if (!backupRaw(domain, sourceFingerprint, raw, storage)) return false;
  if (!legacyDomainIsValid(domain, storage)) {
    quarantineLegacy(domain, raw, storage);
    return false;
  }
  if (!migrateDomain(domain, GUEST_OWNER_SCOPE, storage, false)) return false;
  return writeMarker({
    version: 1,
    domain,
    sourceFingerprint,
    decision: "assigned_to_guest",
    targetScope: GUEST_OWNER_SCOPE.key,
    decidedAt: new Date().toISOString(),
  }, GUEST_OWNER_SCOPE, storage);
}

export function inspectLegacyPersonalData(
  scope: LocalOwnerScope,
  storage: PersonalStorageLike,
): LegacyPersonalDataCandidate[] {
  if (scope.kind !== "user") return [];
  return (["profile", "themes", "ai"] as const).flatMap<LegacyPersonalDataCandidate>((domain) => {
    const raw = rawBundle(domain, storage);
    if (!raw) return [];
    const sourceFingerprint = fingerprint(raw);
    const marker = readMarker(domain, scope, sourceFingerprint, storage);
    if (marker && marker.decision !== "deferred") return [];
    const deferred = marker?.decision === "deferred";
    if (domain === "profile") {
      if (!legacyProfile(storage)) {
        quarantineLegacy(domain, raw, storage);
        return [];
      }
      return [{
        domain,
        fingerprint: sourceFingerprint,
        recordCount: 1,
        destinationHasData: destinationHasData(domain, scope, storage),
        deferred,
      }];
    }
    if (domain === "themes") {
      const value = legacyThemes(storage);
      if (!value) {
        quarantineLegacy(domain, raw, storage);
        return [];
      }
      if (value.collection.themes.length === 0) return [];
      return [{
        domain,
        fingerprint: sourceFingerprint,
        recordCount: value.collection.themes.length,
        destinationHasData: destinationHasData(domain, scope, storage),
        deferred,
      }];
    }
    const value = legacyAi(storage);
    if (!value) {
      quarantineLegacy(domain, raw, storage);
      return [];
    }
    return [{
      domain,
      fingerprint: sourceFingerprint,
      recordCount: value.sessions.sessions.length + value.feedback.recommendationEvents.length,
      hasSensitiveConsent: value.preferences.settings.usePersonalNotes
        || value.preferences.dataToggles.notes,
      destinationHasData: destinationHasData(domain, scope, storage),
      deferred,
    }];
  });
}

export function decideLegacyPersonalOwnership(
  scope: LocalOwnerScope,
  candidate: LegacyPersonalDataCandidate,
  decision: PersonalOwnershipDecision,
  storage: PersonalStorageLike,
): { ok: boolean; message?: string } {
  const raw = rawBundle(candidate.domain, storage);
  if (!raw || fingerprint(raw) !== candidate.fingerprint) {
    return { ok: false, message: "Eski verinin kaynagi degisti; karar uygulanmadi." };
  }
  if (!backupRaw(candidate.domain, candidate.fingerprint, raw, storage)) {
    return { ok: false, message: "Raw backup dogrulanamadi." };
  }
  if (decision === "assigned_to_user") {
    if (candidate.destinationHasData || scope.kind !== "user") {
      return { ok: false, message: "Dolu hedefe otomatik replace veya merge yapilmadi." };
    }
    if (!migrateDomain(candidate.domain, scope, storage, candidate.domain === "ai")) {
      return { ok: false, message: "Owner-scoped safe-write tamamlanamadi." };
    }
  } else if (decision === "assigned_to_guest") {
    const guestMarker = readMarker(
      candidate.domain,
      GUEST_OWNER_SCOPE,
      candidate.fingerprint,
      storage,
    );
    if (!guestMarker && !migrateLegacyPersonalDomainToGuest(candidate.domain, storage)) {
      return {
        ok: false,
        message: "Guest hedef dolu veya safe-write basarisiz; otomatik merge yapilmadi.",
      };
    }
  }
  const marker: PersonalOwnershipDecisionRecord = {
    version: 1,
    domain: candidate.domain,
    sourceFingerprint: candidate.fingerprint,
    decision,
    targetScope: decision === "assigned_to_user"
      ? scope.key
      : decision === "assigned_to_guest"
        ? GUEST_OWNER_SCOPE.key
        : undefined,
    decidedAt: new Date().toISOString(),
  };
  return writeMarker(marker, scope, storage)
    ? { ok: true }
    : { ok: false, message: "Sahiplik karar marker'i yazilamadi." };
}
