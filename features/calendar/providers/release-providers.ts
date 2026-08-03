import {
  decodeReleaseEvent,
  isReleaseEligible,
  resolveTvSeasonIdentity,
  sortReleaseEvents,
  type MovieReleaseType,
  type ReleaseDatePrecision,
  type ReleaseEvent,
  type ReleaseProvider,
  type ReleaseProviderContext,
  type ReleaseProviderFetchRequest,
} from "@/features/calendar/domain/release-calendar";
import {
  getCanonicalMediaIdentity,
  parseCanonicalMediaKeyV2,
} from "@/lib/media-identity";
import type { MediaItem } from "@/lib/types";

export interface ReleaseFetchError {
  code: "network" | "rate_limited" | "server" | "permanent" | "invalid_payload";
  message: string;
  status?: number;
  retryAfterMs?: number;
}

export class ReleaseProviderError extends Error {
  readonly detail: ReleaseFetchError;

  constructor(detail: ReleaseFetchError) {
    super(detail.message);
    this.name = "ReleaseProviderError";
    this.detail = detail;
  }
}

export interface ReleaseRequestOptions {
  fetcher?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  timeoutMs?: number;
}

function retryAfterMs(response: Response, now = Date.now()): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

export async function fetchReleaseJson(
  url: string,
  options: ReleaseRequestOptions = {},
): Promise<unknown> {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 3));
  const maxRetryDelayMs = Math.max(0, options.maxRetryDelayMs ?? 30_000);
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 10_000, 30_000));
  let lastError: ReleaseProviderError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      lastError = new ReleaseProviderError({
        code: "network",
        message: "Release provider ağına ulaşılamadı.",
      });
      if (attempt < maxAttempts) {
        await sleep(Math.min(250 * 2 ** (attempt - 1), maxRetryDelayMs));
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      try {
        return await response.json() as unknown;
      } catch {
        throw new ReleaseProviderError({
          code: "invalid_payload",
          message: "Release provider JSON payload geçersiz.",
          status: response.status,
        });
      }
    }

    const retryAfter = retryAfterMs(response);
    if (response.status === 429) {
      lastError = new ReleaseProviderError({
        code: "rate_limited",
        message: "Release provider istek sınırına ulaştı.",
        status: response.status,
        retryAfterMs: retryAfter,
      });
      if (attempt < maxAttempts) {
        await sleep(Math.min(retryAfter ?? 500 * 2 ** (attempt - 1), maxRetryDelayMs));
        continue;
      }
      throw lastError;
    }
    if (response.status >= 500) {
      lastError = new ReleaseProviderError({
        code: "server",
        message: "Release provider geçici sunucu hatası döndürdü.",
        status: response.status,
      });
      if (attempt < maxAttempts) {
        await sleep(Math.min(250 * 2 ** (attempt - 1), maxRetryDelayMs));
        continue;
      }
      throw lastError;
    }
    throw new ReleaseProviderError({
      code: "permanent",
      message: "Release provider isteği kalıcı olarak reddedildi.",
      status: response.status,
    });
  }
  throw lastError ?? new ReleaseProviderError({
    code: "network",
    message: "Release provider isteği tamamlanamadı.",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDateOnly(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return decodeReleaseEvent({
    schemaVersion: 1,
    id: "date-check",
    mediaRecordId: "date-check",
    type: "manual",
    title: "date-check",
    date: { precision: "date_only", date: value },
    origin: { kind: "manual", persistence: "persistent_user_data" },
  }).status === "valid";
}

function validExactDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return decodeReleaseEvent({
    schemaVersion: 1,
    id: "date-check",
    mediaRecordId: "date-check",
    type: "manual",
    title: "date-check",
    date: { precision: "exact_datetime", dateTime: value },
    origin: { kind: "manual", persistence: "persistent_user_data" },
  }).status === "valid";
}

function canonicalKey(item: MediaItem): string | undefined {
  return getCanonicalMediaIdentity(item)?.key;
}

function validEvent(event: ReleaseEvent): ReleaseEvent | null {
  const decoded = decodeReleaseEvent(event);
  return decoded.status === "valid" ? decoded.value : null;
}

export function dedupeProviderReleaseEvents(
  events: readonly ReleaseEvent[],
): ReleaseEvent[] {
  const selected = new Map<string, ReleaseEvent>();
  for (const event of sortReleaseEvents(events)) {
    const key = event.origin.kind === "provider"
      ? `${event.origin.provider}:${event.origin.providerEventId}`
      : `manual:${event.id}`;
    if (!selected.has(key)) selected.set(key, event);
  }
  return sortReleaseEvents([...selected.values()]);
}

interface TvmazeEpisodePayload {
  id: number;
  season: number;
  number: number | null;
  name: string | null;
  airdate: string | null;
  airstamp: string | null;
}

function tvmazeEpisodes(payload: unknown): TvmazeEpisodePayload[] {
  if (!isRecord(payload) || !Array.isArray(payload.episodes)) return [];
  return payload.episodes.flatMap((value) => {
    if (
      !isRecord(value)
      || typeof value.id !== "number"
      || typeof value.season !== "number"
    ) return [];
    return [{
      id: value.id,
      season: value.season,
      number: typeof value.number === "number" ? value.number : null,
      name: typeof value.name === "string" ? value.name : null,
      airdate: typeof value.airdate === "string" ? value.airdate : null,
      airstamp: typeof value.airstamp === "string" ? value.airstamp : null,
    }];
  });
}

export function normalizeTvmazeReleaseEvents(
  payload: unknown,
  context: ReleaseProviderContext,
): ReleaseEvent[] {
  const resolvedSeason = resolveTvSeasonIdentity(context.media);
  const season = context.seasonIdentity
    ?? (resolvedSeason.status === "resolved" ? resolvedSeason.value : undefined);
  if (!season || season.providerSource !== "tvmaze" || !season.providerShowId) return [];
  const events = tvmazeEpisodes(payload).flatMap((episode) => {
    if (episode.season !== season.seasonNumber) return [];
    let date: ReleaseDatePrecision;
    if (validExactDateTime(episode.airstamp)) {
      date = { precision: "exact_datetime", dateTime: episode.airstamp };
    } else if (validDateOnly(episode.airdate)) {
      date = { precision: "date_only", date: episode.airdate };
    } else {
      // TVMaze episode kaydı tarih taşımıyorsa bunun gelecekteki bir olay olduğu
      // güvenle kanıtlanamaz; sırf sonuç var diye TBA üretilmez.
      return [];
    }
    const event = validEvent({
      schemaVersion: 1,
      id: `tvmaze:${episode.id}`,
      mediaRecordId: context.media.id,
      mediaIdentityKey: canonicalKey(context.media),
      type: "episode",
      title: context.media.title,
      date,
      origin: {
        kind: "provider",
        provider: "tvmaze",
        providerEventId: String(episode.id),
        persistence: "reproducible_cache",
      },
      seasonIdentity: season,
      episodeNumber: episode.number ?? undefined,
      metadata: { episodeName: episode.name ?? undefined },
    });
    return event ? [event] : [];
  });
  return dedupeProviderReleaseEvents(events);
}

interface AniListSchedulePayload {
  id: number;
  airingAt: number;
  episode: number;
}

export function normalizeAniListReleaseEvents(
  payload: unknown,
  context: ReleaseProviderContext,
  nowMs = Date.now(),
): ReleaseEvent[] {
  if (!isRecord(payload) || !Array.isArray(payload.schedules)) return [];
  const maxTime = nowMs + 90 * 24 * 60 * 60 * 1000;
  const events = payload.schedules.flatMap((value) => {
    if (
      !isRecord(value)
      || typeof value.id !== "number"
      || typeof value.airingAt !== "number"
      || typeof value.episode !== "number"
      || !Number.isInteger(value.episode)
      || value.episode <= 0
    ) return [];
    const schedule = value as unknown as AniListSchedulePayload;
    const airingAtMs = schedule.airingAt * 1000;
    if (
      !Number.isFinite(airingAtMs)
      || airingAtMs < nowMs
      || airingAtMs > maxTime
    ) return [];
    const dateTime = new Date(airingAtMs).toISOString();
    const event = validEvent({
      schemaVersion: 1,
      id: `anilist:${schedule.id}`,
      mediaRecordId: context.media.id,
      mediaIdentityKey: canonicalKey(context.media),
      type: "episode",
      title: context.media.title,
      date: { precision: "exact_datetime", dateTime },
      origin: {
        kind: "provider",
        provider: "anilist",
        providerEventId: String(schedule.id),
        persistence: "reproducible_cache",
      },
      episodeNumber: schedule.episode,
    });
    return event ? [event] : [];
  });
  return dedupeProviderReleaseEvents(events);
}

interface TmdbReleasePayload {
  movieId: number;
  originalReleaseDate: string | null;
  releases: Array<{ region: string; dateTime: string; type: number }>;
}

function decodeTmdbPayload(payload: unknown): TmdbReleasePayload | null {
  if (
    !isRecord(payload)
    || typeof payload.movieId !== "number"
    || !Array.isArray(payload.releases)
  ) return null;
  return {
    movieId: payload.movieId,
    originalReleaseDate:
      typeof payload.originalReleaseDate === "string" ? payload.originalReleaseDate : null,
    releases: payload.releases.flatMap((value) => {
      if (
        !isRecord(value)
        || typeof value.region !== "string"
        || typeof value.dateTime !== "string"
        || typeof value.type !== "number"
      ) return [];
      return [{
        region: value.region.toUpperCase(),
        dateTime: value.dateTime,
        type: value.type,
      }];
    }),
  };
}

function localeRegion(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  try {
    return new Intl.Locale(locale.replace("_", "-")).region?.toUpperCase();
  } catch {
    return undefined;
  }
}

export function resolveTmdbReleaseRegion(input: {
  preferredRegion?: string;
  locale?: string;
  availableRegions: readonly string[];
}): string | undefined {
  const available = new Set(input.availableRegions.map((region) => region.toUpperCase()));
  const preferred = input.preferredRegion?.trim().toUpperCase();
  if (preferred && /^[A-Z]{2}$/.test(preferred) && available.has(preferred)) {
    return preferred;
  }
  const fromLocale = localeRegion(input.locale);
  return fromLocale && available.has(fromLocale) ? fromLocale : undefined;
}

function tmdbReleaseType(type: number): MovieReleaseType {
  if (type === 2 || type === 3) return "theatrical";
  if (type === 4) return "digital";
  return "general";
}

const RELEASE_TYPE_PRIORITY: Record<MovieReleaseType, number> = {
  theatrical: 0,
  digital: 1,
  general: 2,
};

export function normalizeTmdbReleaseEvents(
  payload: unknown,
  context: ReleaseProviderContext,
  options: {
    preferredRegion?: string;
    locale?: string;
    today?: string;
  } = {},
): ReleaseEvent[] {
  const decoded = decodeTmdbPayload(payload);
  if (!decoded) return [];
  const region = resolveTmdbReleaseRegion({
    preferredRegion: options.preferredRegion,
    locale: options.locale,
    availableRegions: decoded.releases.map((release) => release.region),
  });
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 90);
  const horizonDate = horizon.toISOString().slice(0, 10);
  const regional = region
    ? decoded.releases
        .filter((release) => release.region === region)
        .flatMap((release) => {
          if (!validExactDateTime(release.dateTime)) return [];
          return [{ ...release, releaseType: tmdbReleaseType(release.type) }];
        })
    : [];
  const candidates = regional.filter((release) => {
    const date = release.dateTime.slice(0, 10);
    return date >= today && date <= horizonDate;
  });
  candidates.sort((left, right) =>
    RELEASE_TYPE_PRIORITY[left.releaseType] - RELEASE_TYPE_PRIORITY[right.releaseType]
    || (left.dateTime < right.dateTime ? -1 : left.dateTime > right.dateTime ? 1 : 0)
    || left.type - right.type);

  const selected = candidates[0];
  let event: ReleaseEvent | null = null;
  if (selected) {
    event = validEvent({
      schemaVersion: 1,
      id: `tmdb:${decoded.movieId}:${selected.region}:${selected.type}:${selected.dateTime}`,
      mediaRecordId: context.media.id,
      mediaIdentityKey: canonicalKey(context.media),
      type: "movie_release",
      title: context.media.title,
      date: { precision: "exact_datetime", dateTime: selected.dateTime },
      origin: {
        kind: "provider",
        provider: "tmdb",
        providerEventId: `${decoded.movieId}:${selected.region}:${selected.type}:${selected.dateTime}`,
        persistence: "reproducible_cache",
      },
      metadata: {
        releaseType: selected.releaseType,
        region: selected.region,
      },
    });
  } else if (
    validDateOnly(decoded.originalReleaseDate)
    && decoded.originalReleaseDate >= today
    && decoded.originalReleaseDate <= horizonDate
  ) {
    event = validEvent({
      schemaVersion: 1,
      id: `tmdb:${decoded.movieId}:general:${decoded.originalReleaseDate}`,
      mediaRecordId: context.media.id,
      mediaIdentityKey: canonicalKey(context.media),
      type: "movie_release",
      title: context.media.title,
      date: { precision: "date_only", date: decoded.originalReleaseDate },
      origin: {
        kind: "provider",
        provider: "tmdb",
        providerEventId: `${decoded.movieId}:general:${decoded.originalReleaseDate}`,
        persistence: "reproducible_cache",
      },
      metadata: { releaseType: "general" },
    });
  }
  return event ? [event] : [];
}

export interface ReleaseProviderRuntimeOptions extends ReleaseRequestOptions {
  preferredRegion?: string;
  locale?: string;
  now?: () => number;
}

function providerIdFromRequest(
  request: ReleaseProviderFetchRequest,
  source: "anilist" | "tmdb",
  namespace: "anime" | "movie",
): string | null {
  const identity = request.mediaIdentityKey
    ? parseCanonicalMediaKeyV2(request.mediaIdentityKey)
    : null;
  return identity?.source === source
    && identity.namespace === namespace
    && identity.externalId
      ? identity.externalId
      : null;
}

export function createReleaseProviders(
  options: ReleaseProviderRuntimeOptions = {},
): {
  tvmaze: ReleaseProvider<unknown>;
  anilist: ReleaseProvider<unknown>;
  tmdb: ReleaseProvider<unknown>;
} {
  const tvmaze: ReleaseProvider<unknown> = {
    id: "tvmaze",
    supports(context) {
      if (context.media.type !== "tv" || !isReleaseEligible(context.media)) return false;
      const resolved = resolveTvSeasonIdentity(context.media);
      return resolved.status === "resolved"
        && resolved.value.providerSource === "tvmaze"
        && typeof resolved.value.providerShowId === "string"
        && /^[1-9]\d*$/.test(resolved.value.providerShowId);
    },
    fetchEvents(request) {
      const showId = request.seasonIdentity?.providerShowId;
      const season = request.seasonIdentity?.seasonNumber;
      if (!showId || !season) {
        throw new ReleaseProviderError({
          code: "permanent",
          message: "TVMaze show/sezon kimliği çözülemedi.",
        });
      }
      return fetchReleaseJson(
        `/api/calendar/tvmaze?showId=${encodeURIComponent(showId)}&season=${season}`,
        options,
      );
    },
    normalize(payload, context) {
      return normalizeTvmazeReleaseEvents(payload, context).map((value) => ({
        status: "valid" as const,
        value,
      }));
    },
  };
  const anilist: ReleaseProvider<unknown> = {
    id: "anilist",
    supports(context) {
      const identity = getCanonicalMediaIdentity(context.media);
      return context.media.type === "anime"
        && isReleaseEligible(context.media)
        && identity?.source === "anilist"
        && identity.namespace === "anime";
    },
    fetchEvents(request) {
      const mediaId = providerIdFromRequest(request, "anilist", "anime");
      if (!mediaId) {
        throw new ReleaseProviderError({
          code: "permanent",
          message: "AniList provider kimliği bulunamadı.",
        });
      }
      return fetchReleaseJson(
        `/api/calendar/anilist?mediaId=${encodeURIComponent(mediaId)}`,
        options,
      );
    },
    normalize(payload, context) {
      return normalizeAniListReleaseEvents(
        payload,
        context,
        options.now?.() ?? Date.now(),
      ).map((value) => ({ status: "valid" as const, value }));
    },
  };
  const tmdb: ReleaseProvider<unknown> = {
    id: "tmdb",
    supports(context) {
      const identity = getCanonicalMediaIdentity(context.media);
      return context.media.type === "movie"
        && isReleaseEligible(context.media)
        && identity?.source === "tmdb"
        && identity.namespace === "movie";
    },
    fetchEvents(request) {
      const movieId = providerIdFromRequest(request, "tmdb", "movie");
      if (!movieId) {
        throw new ReleaseProviderError({
          code: "permanent",
          message: "TMDB provider kimliği bulunamadı.",
        });
      }
      return fetchReleaseJson(
        `/api/calendar/tmdb?movieId=${encodeURIComponent(movieId)}`,
        options,
      );
    },
    normalize(payload, context) {
      const now = options.now?.() ?? Date.now();
      return normalizeTmdbReleaseEvents(payload, context, {
        preferredRegion: options.preferredRegion,
        locale: options.locale,
        today: new Date(now).toISOString().slice(0, 10),
      }).map((value) => ({ status: "valid" as const, value }));
    },
  };
  return { tvmaze, anilist, tmdb };
}

export type AutomaticReleaseProviderSet = ReturnType<typeof createReleaseProviders>;

export function releaseProviderForMedia(
  media: MediaItem,
  providers: AutomaticReleaseProviderSet,
): ReleaseProvider<unknown> | null {
  const resolvedSeason = media.type === "tv"
    ? resolveTvSeasonIdentity(media)
    : null;
  const context: ReleaseProviderContext = {
    media,
    seasonIdentity:
      resolvedSeason?.status === "resolved"
        ? resolvedSeason.value
        : undefined,
  };
  if (media.type === "tv") return providers.tvmaze.supports(context) ? providers.tvmaze : null;
  if (media.type === "anime") {
    return providers.anilist.supports(context) ? providers.anilist : null;
  }
  if (media.type === "movie") return providers.tmdb.supports(context) ? providers.tmdb : null;
  return null;
}
