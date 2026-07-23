import type { StorageWriteResult } from "../local-data-storage";
import type { LocalOwnerScope } from "../local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "../personal-data-storage";
import type {
  AiSettings,
  RecommendationFeedbackAction,
  RecommendationFeedbackEvent,
} from "./types";

export interface AiSessionLocalState {
  version: 1;
  sessions: Record<string, unknown>[];
  activeSession?: Record<string, unknown>;
}

export interface AiFeedbackLocalState {
  version: 1;
  dismissedSignals: Record<string, Record<string, unknown>>;
  recommendationEvents: RecommendationFeedbackEvent[];
}

export interface AiPreferencesLocalState {
  version: 1;
  settings: AiSettings;
  dataToggles: {
    ratings: boolean;
    favorites: boolean;
    progress: boolean;
    notes: boolean;
    recentActivity: boolean;
  };
  scopeMode: "mixed" | "east" | "screen" | "arch" | "one-per-world";
  researchMode: "library-only" | "source-apis" | "web";
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  useProfile: true,
  useRecentActivity: true,
  usePersonalNotes: false,
  useWebResearch: true,
  deepResearch: false,
  useOpenAIProvider: false,
};

export const DEFAULT_AI_PREFERENCES: AiPreferencesLocalState = {
  version: 1,
  settings: { ...DEFAULT_AI_SETTINGS },
  dataToggles: {
    ratings: true,
    favorites: true,
    progress: true,
    notes: false,
    recentActivity: true,
  },
  scopeMode: "mixed",
  researchMode: "library-only",
};

const MEDIA_TYPES = new Set([
  "tv", "anime", "manga", "manhwa", "manhua", "book", "movie",
  "light_novel", "web_novel", "visual_novel",
]);
const FEEDBACK_ACTIONS = new Set<RecommendationFeedbackAction>([
  "shown", "dismissed", "similar_requested", "added", "open_discover",
]);
const EXTERNAL_SOURCES = new Set([
  "tvmaze", "anilist", "openlibrary", "omdb", "tmdb", "library",
]);
const SCOPES = new Set(["mixed", "east", "screen", "arch", "one-per-world"]);
const RESEARCH = new Set(["library-only", "source-apis", "web"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.slice(0, max);
  return normalized || undefined;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function boundedRecord(value: unknown, maxBytes = 100_000): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  try {
    if (JSON.stringify(value).length > maxBytes) return undefined;
    return structuredClone(value);
  } catch {
    return undefined;
  }
}

function normalizeSession(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const id = text(value.id, 128);
  const prompt = text(value.prompt, 4_000);
  const assistantMessage = text(value.assistantMessage, 16_000);
  if (!id || !prompt || !assistantMessage || !validDate(value.createdAt)) return null;
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations.slice(0, 50).flatMap((item) => {
        const record = boundedRecord(item, 20_000);
        return record ? [record] : [];
      })
    : [];
  return {
    id,
    createdAt: value.createdAt,
    prompt,
    assistantMessage,
    recommendations,
    ...(Array.isArray(value.rejectedCandidates)
      ? { rejectedCandidates: value.rejectedCandidates.slice(0, 50) }
      : {}),
    ...(boundedRecord(value.settings, 8_000) ? { settings: boundedRecord(value.settings, 8_000) } : {}),
    ...(boundedRecord(value.debug) ? { debug: boundedRecord(value.debug) } : {}),
    ...(boundedRecord(value.engineStatus, 20_000)
      ? { engineStatus: boundedRecord(value.engineStatus, 20_000) }
      : {}),
  };
}

function normalizeActiveSession(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || value.v !== 1) return undefined;
  const messages = Array.isArray(value.messages)
    ? value.messages.slice(-100).flatMap((candidate) => {
        if (!isRecord(candidate)) return [];
        const id = text(candidate.id, 128);
        const content = text(candidate.content, 16_000);
        if (!id || !content || (candidate.role !== "user" && candidate.role !== "assistant")) {
          return [];
        }
        return [{ id, role: candidate.role, content }];
      })
    : [];
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations.slice(0, 50).flatMap((item) => {
        const record = boundedRecord(item, 20_000);
        return record ? [record] : [];
      })
    : [];
  return {
    v: 1,
    messages,
    recommendations,
    rejected: Array.isArray(value.rejected) ? value.rejected.slice(0, 50) : [],
    addedIds: boundedRecord(value.addedIds, 20_000) ?? {},
    pendingClarification: boundedRecord(value.pendingClarification, 10_000) ?? null,
    debugInfo: boundedRecord(value.debugInfo) ?? null,
    engineStatus: boundedRecord(value.engineStatus, 20_000) ?? null,
    activeContext: boundedRecord(value.activeContext, 30_000) ?? null,
  };
}

export const aiSessionCodec: PersonalDataCodec<AiSessionLocalState> = (value) => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.sessions)) {
    return { ok: false, message: "AI session state formati gecersiz." };
  }
  const sessions = value.sessions.slice(-8).map(normalizeSession).filter(
    (item): item is Record<string, unknown> => item !== null,
  );
  return {
    ok: true,
    value: {
      version: 1,
      sessions,
      ...(normalizeActiveSession(value.activeSession)
        ? { activeSession: normalizeActiveSession(value.activeSession) }
        : {}),
    },
  };
};

function normalizeFeedbackEvent(value: unknown): RecommendationFeedbackEvent | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || !FEEDBACK_ACTIONS.has(value.action as RecommendationFeedbackAction)
    || typeof value.recommendationId !== "string"
    || typeof value.title !== "string"
    || !MEDIA_TYPES.has(String(value.mediaType))
    || typeof value.source !== "string"
    || !validDate(value.createdAt)
  ) return null;
  return {
    id: value.id.slice(0, 128),
    action: value.action as RecommendationFeedbackAction,
    recommendationId: value.recommendationId.slice(0, 128),
    title: value.title.slice(0, 300),
    mediaType: value.mediaType as RecommendationFeedbackEvent["mediaType"],
    source: value.source.slice(0, 80),
    ...(typeof value.externalSource === "string" && EXTERNAL_SOURCES.has(value.externalSource)
      ? { externalSource: value.externalSource as RecommendationFeedbackEvent["externalSource"] }
      : {}),
    ...(typeof value.externalId === "string" ? { externalId: value.externalId.slice(0, 160) } : {}),
    ...(typeof value.sessionId === "string" ? { sessionId: value.sessionId.slice(0, 128) } : {}),
    ...(typeof value.prompt === "string" ? { prompt: value.prompt.slice(0, 4_000) } : {}),
    ...(isRecord(value.metadata)
      ? {
          metadata: {
            ...(typeof value.metadata.fitLabel === "string"
              ? { fitLabel: value.metadata.fitLabel.slice(0, 120) }
              : {}),
            ...(typeof value.metadata.inLibrary === "boolean"
              ? { inLibrary: value.metadata.inLibrary }
              : {}),
            ...(typeof value.metadata.canAdd === "boolean"
              ? { canAdd: value.metadata.canAdd }
              : {}),
          },
        }
      : {}),
    createdAt: value.createdAt,
  };
}

export const aiFeedbackCodec: PersonalDataCodec<AiFeedbackLocalState> = (value) => {
  if (!isRecord(value) || value.version !== 1) {
    return { ok: false, message: "AI feedback state formati gecersiz." };
  }
  const dismissedSignals: Record<string, Record<string, unknown>> = {};
  if (isRecord(value.dismissedSignals)) {
    for (const [key, candidate] of Object.entries(value.dismissedSignals).slice(-100)) {
      if (!isRecord(candidate)) continue;
      const title = text(candidate.title, 300);
      if (!title || !MEDIA_TYPES.has(String(candidate.mediaType))) continue;
      dismissedSignals[key.slice(0, 500)] = {
        title,
        mediaType: candidate.mediaType,
        ...(text(candidate.externalSource, 40)
          ? { externalSource: text(candidate.externalSource, 40) }
          : {}),
        ...(text(candidate.externalId, 160) ? { externalId: text(candidate.externalId, 160) } : {}),
        ...(validDate(candidate.dismissedAt) ? { dismissedAt: candidate.dismissedAt } : {}),
      };
    }
  }
  const recommendationEvents = Array.isArray(value.recommendationEvents)
    ? value.recommendationEvents.slice(-1000).map(normalizeFeedbackEvent).filter(
        (item): item is RecommendationFeedbackEvent => item !== null,
      )
    : [];
  return {
    ok: true,
    value: { version: 1, dismissedSignals, recommendationEvents },
  };
};

export const aiPreferencesCodec: PersonalDataCodec<AiPreferencesLocalState> = (value) => {
  if (!isRecord(value) || value.version !== 1) {
    return { ok: false, message: "AI preference state formati gecersiz." };
  }
  const settings = isRecord(value.settings) ? value.settings : {};
  const toggles = isRecord(value.dataToggles) ? value.dataToggles : {};
  return {
    ok: true,
    value: {
      version: 1,
      settings: {
        useProfile: settings.useProfile !== false,
        useRecentActivity: settings.useRecentActivity !== false,
        usePersonalNotes: settings.usePersonalNotes === true,
        useWebResearch: settings.useWebResearch !== false,
        deepResearch: settings.deepResearch === true,
        useOpenAIProvider: settings.useOpenAIProvider === true,
        includeRatings: settings.includeRatings !== false,
        includeFavorites: settings.includeFavorites !== false,
        includeProgress: settings.includeProgress !== false,
      },
      dataToggles: {
        ratings: toggles.ratings !== false,
        favorites: toggles.favorites !== false,
        progress: toggles.progress !== false,
        notes: toggles.notes === true,
        recentActivity: toggles.recentActivity !== false,
      },
      scopeMode: SCOPES.has(String(value.scopeMode))
        ? value.scopeMode as AiPreferencesLocalState["scopeMode"]
        : "mixed",
      researchMode: RESEARCH.has(String(value.researchMode))
        ? value.researchMode as AiPreferencesLocalState["researchMode"]
        : "library-only",
    },
  };
};

export function readAiSessionState(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike,
): PersonalDataReadResult<AiSessionLocalState> {
  return readPersonalData(scope, "aiSession", aiSessionCodec, storage);
}

export function writeAiSessionState(
  scope: LocalOwnerScope,
  state: AiSessionLocalState,
  storage?: PersonalStorageLike,
): StorageWriteResult {
  return writePersonalData(scope, "aiSession", state, aiSessionCodec, storage);
}

export function readAiFeedbackState(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike,
): PersonalDataReadResult<AiFeedbackLocalState> {
  return readPersonalData(scope, "aiFeedback", aiFeedbackCodec, storage);
}

export function writeAiFeedbackState(
  scope: LocalOwnerScope,
  state: AiFeedbackLocalState,
  storage?: PersonalStorageLike,
): StorageWriteResult {
  return writePersonalData(scope, "aiFeedback", state, aiFeedbackCodec, storage);
}

export function readAiPreferencesState(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike,
): PersonalDataReadResult<AiPreferencesLocalState> {
  return readPersonalData(scope, "aiPreferences", aiPreferencesCodec, storage);
}

export function writeAiPreferencesState(
  scope: LocalOwnerScope,
  state: AiPreferencesLocalState,
  storage?: PersonalStorageLike,
): StorageWriteResult {
  return writePersonalData(scope, "aiPreferences", state, aiPreferencesCodec, storage);
}
