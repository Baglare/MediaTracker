import "server-only";

import { resolveConnectionState } from "@/lib/social/relationships";
import { canViewModule } from "@/lib/social/visibility";
import {
  CONNECTION_COLORS,
  PROFILE_VISIBILITIES,
  type ConnectionColor,
  type FollowStatus,
  type ProfileModuleLayout,
  type PublicSocialProfile,
  type SocialMediaSnapshot,
  type SocialPersonSummary,
  type SocialProfileEditorData,
  type SocialProfilePayload,
} from "@/lib/social/types";
import { validateMediaSnapshot, validateModuleLayout, validateProgressionSnapshot, validateStatsSnapshot } from "@/lib/social/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { socialRecord, validateActivityVisibility, validateSocialMediaSnapshot, validateUuid } from "@/lib/social/interactions-validation";
import { validateActivityType } from "@/lib/social/interactions-validation";
import { parsePublicXpSummary } from "@/lib/xp/validation";
import { normalizeProfilePresentationPreferences } from "@/lib/personalization/validation";
import { decodePublicProfileThemeSnapshot } from "@/lib/personalization/public-profile-theme";
import type { OwnProfileHeroData, OwnProfileSummary } from "@/lib/social/profile-summary";

const BUCKET = "profile-assets";
type SocialServerClient = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;
const SIGNED_URL_TTL_SECONDS = 300;
const SIGNED_URL_CACHE_TTL_MS = 240_000;
const SIGNED_URL_CACHE_MAX = 256;
type AssetKind = "avatar" | "banner";
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const signedUrlInFlight = new Map<string, Promise<string | undefined>>();

function objectOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function colorOf(value: unknown): ConnectionColor {
  return CONNECTION_COLORS.includes(value as ConnectionColor) ? value as ConnectionColor : "neutral";
}

function followOf(value: unknown): FollowStatus | null {
  return value === "pending" || value === "accepted" ? value : null;
}

function signedUrlKey(path: string, kind: AssetKind, revision: string): string {
  return `${BUCKET}:${kind}:${path}:${revision}`;
}

export function invalidateSignedSocialAssetUrl(path: unknown): void {
  const assetPath = stringOf(path);
  if (!assetPath) return;
  for (const cacheKey of signedUrlCache.keys()) if (cacheKey.includes(`:${assetPath}:`)) signedUrlCache.delete(cacheKey);
}

export function resetSignedSocialAssetUrlCacheForTests(): void {
  signedUrlCache.clear();
  signedUrlInFlight.clear();
}

async function createSignedSocialAssetUrlWithClient(client: SocialServerClient, path: unknown, kind: AssetKind, revision?: unknown): Promise<string | undefined> {
  const assetPath = stringOf(path);
  if (!assetPath) return undefined;
  const assetRevision = stringOf(revision) ?? assetPath;
  const cacheKey = signedUrlKey(assetPath, kind, assetRevision);
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.url;
  if (cached) signedUrlCache.delete(cacheKey);
  const running = signedUrlInFlight.get(cacheKey);
  if (running) return running;
  const request = client.storage.from(BUCKET).createSignedUrl(assetPath, SIGNED_URL_TTL_SECONDS).then(({ data, error }) => {
    if (error || !data.signedUrl) return undefined;
    if (signedUrlCache.size >= SIGNED_URL_CACHE_MAX) signedUrlCache.delete(signedUrlCache.keys().next().value as string);
    signedUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_CACHE_TTL_MS });
    return data.signedUrl;
  }).finally(() => signedUrlInFlight.delete(cacheKey));
  signedUrlInFlight.set(cacheKey, request);
  return request;
}

export async function createSignedSocialAssetUrl(path: unknown, kind: AssetKind = "avatar", revision?: unknown): Promise<string | undefined> {
  const client = await getSupabaseServerClient();
  return client ? createSignedSocialAssetUrlWithClient(client, path, kind, revision) : undefined;
}

function relationshipOf(value: unknown, ownerColor: ConnectionColor) {
  const record = objectOf(value) ?? {};
  const facts = {
    viewerFollowsOwner: followOf(record.viewerFollowsOwner),
    ownerFollowsViewer: followOf(record.ownerFollowsViewer),
    self: record.self === true,
    anonymous: record.anonymous !== false,
  };
  return {
    ...facts,
    state: resolveConnectionState(facts),
    ownerColor,
    viewerColor: colorOf(record.viewerConnectionColor),
  };
}

function profileOf(value: unknown): Omit<PublicSocialProfile, "avatarUrl" | "bannerUrl"> | null {
  const record = objectOf(value);
  const visibility = record?.visibilityMode;
  if (!record || !stringOf(record.id) || !stringOf(record.username) || !PROFILE_VISIBILITIES.includes(visibility as PublicSocialProfile["visibilityMode"])) return null;
  return {
    id: String(record.id),
    username: String(record.username),
    displayName: stringOf(record.displayName) ?? String(record.username),
    tagline: stringOf(record.tagline) ?? "",
    bio: stringOf(record.bio) ?? "",
    location: stringOf(record.location),
    language: stringOf(record.language),
    visibilityMode: visibility as PublicSocialProfile["visibilityMode"],
    connectionColor: colorOf(record.connectionColor),
    joinedAt: stringOf(record.joinedAt) ?? new Date(0).toISOString(),
    selectedTitle: stringOf(record.selectedTitle),
    presentation: normalizeProfilePresentationPreferences(record.presentation),
    themeSnapshot: decodePublicProfileThemeSnapshot(record.themeSnapshot),
    followerCount: typeof record.followerCount === "number" ? record.followerCount : undefined,
    followingCount: typeof record.followingCount === "number" ? record.followingCount : undefined,
  };
}

function modulesOf(value: unknown): ProfileModuleLayout[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const result = validateModuleLayout(entry);
    return result.ok ? [result.value] : [];
  });
}

function mediaOf(value: unknown, max: number): SocialMediaSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const result = validateMediaSnapshot(entry, max);
    return result.ok ? [result.value] : [];
  });
}

export async function loadSocialProfile(username: string): Promise<SocialProfilePayload> {
  const empty: SocialProfilePayload = { status: "not_found", modules: [], favorites: [], current: [], sharedNotes: [] };
  const client = await getSupabaseServerClient();
  if (!client) return { ...empty, status: "not_configured" };
  const { data, error } = await client.rpc("get_unified_social_profile", { p_username: username });
  const root = objectOf(data);
  if (error || !root) return empty;
  const status = root.status;
  if (status !== "available") {
    return {
      ...empty,
      status: status === "personal" || status === "unavailable" || status === "not_found" ? status : "not_found",
      redirectUsername: stringOf(root.redirectUsername),
    };
  }
  const rawProfile = objectOf(root.profile);
  const profile = profileOf(rawProfile);
  if (!profile) return empty;
  const relationship = relationshipOf(root.relationship, profile.connectionColor);
  const visibilityContext = {
    anonymous: relationship.anonymous,
    self: relationship.self,
    viewerFollowsOwner: relationship.viewerFollowsOwner === "accepted",
    ownerFollowsViewer: relationship.ownerFollowsViewer === "accepted",
  };
  const modules = modulesOf(root.modules).filter((module) => canViewModule(profile.visibilityMode, module.visibility, visibilityContext));
  const visibleModules = new Set(modules.map((module) => module.moduleKey));
  const stats = visibleModules.has("stats") ? validateStatsSnapshot(root.stats) : null;
  const progression = visibleModules.has("progression") ? validateProgressionSnapshot(root.progression) : null;
  const [avatarUrl, bannerUrl, xpResult, activityResult] = await Promise.all([
    createSignedSocialAssetUrlWithClient(client, rawProfile?.avatarPath, "avatar", rawProfile?.avatarPath),
    createSignedSocialAssetUrlWithClient(client, rawProfile?.bannerPath, "banner", rawProfile?.bannerPath),
    visibleModules.has("progression") || visibleModules.has("badges")
      ? client.rpc("get_xp_public_summary", { p_user: profile.id })
      : Promise.resolve({ data: null, error: null }),
    visibleModules.has("activity")
      ? client.rpc("list_profile_activity", { p_owner: profile.id, p_limit: 8 })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const xp = xpResult.error ? undefined : parsePublicXpSummary(xpResult.data);
  const activity = !activityResult.error && Array.isArray(activityResult.data) ? activityResult.data.flatMap((entry) => {
    const item = socialRecord(entry); const id = validateUuid(item?.id); const type = validateActivityType(item?.eventType); const visibility = validateActivityVisibility(item?.visibility); const media = validateSocialMediaSnapshot(item?.media); const createdAt = stringOf(item?.createdAt);
    return item && id.ok && type.ok && visibility.ok && media.ok && createdAt && !Number.isNaN(Date.parse(createdAt)) ? [{ id: id.value, eventType: type.value, visibility: visibility.value, media: { title: media.value.title, mediaType: media.value.mediaType, coverUrl: media.value.coverUrl }, rating: typeof item.rating === "number" ? item.rating : undefined, text: stringOf(item.text), createdAt }] : [];
  }) : [];
  return {
    status: "available",
    profile: { ...profile, avatarUrl, bannerUrl },
    relationship,
    modules,
    favorites: visibleModules.has("favorites") ? mediaOf(root.favorites, 5) : [],
    current: visibleModules.has("current") ? mediaOf(root.current, 6) : [],
    stats: stats?.ok ? stats.value : undefined,
    progression: progression?.ok ? progression.value : undefined,
    xp,
    sharedNotes: visibleModules.has("shared_notes") && Array.isArray(root.sharedNotes) ? root.sharedNotes as SocialProfilePayload["sharedNotes"] : [],
    activity,
  };
}

export async function searchSocialPeople(query: string, offset = 0): Promise<SocialPersonSummary[]> {
  const client = await getSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client.rpc("search_social_profiles", { p_query: query, p_offset: offset, p_limit: 20 });
  if (error || !Array.isArray(data)) return [];
  return Promise.all(data.flatMap((entry) => {
    const record = objectOf(entry);
    const profile = profileOf(record);
    if (!record || !profile) return [];
    return [{ record, profile }];
  }).map(async ({ record, profile }) => ({
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    visibilityMode: profile.visibilityMode,
    connectionColor: profile.connectionColor,
    avatarUrl: await createSignedSocialAssetUrl(record.avatarPath),
    avatarTransform: profile.presentation.avatarTransform,
    relationship: relationshipOf(record, profile.connectionColor),
  })));
}

export async function loadSocialPersonSummary(targetId: string): Promise<SocialPersonSummary | undefined> {
  const client = await getSupabaseServerClient();
  if (!client) return undefined;
  const { data, error } = await client.rpc("get_social_person_summary", { p_target: targetId });
  const record = objectOf(data);
  const profile = profileOf(record);
  if (error || !record || !profile) return undefined;
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    visibilityMode: profile.visibilityMode,
    connectionColor: profile.connectionColor,
    avatarUrl: await createSignedSocialAssetUrl(record.avatarPath),
    avatarTransform: profile.presentation.avatarTransform,
    relationship: relationshipOf(record, profile.connectionColor),
  };
}

export async function loadOwnSocialEditorData(): Promise<SocialProfileEditorData> {
  const client = await getSupabaseServerClient();
  if (!client) return { configured: false, authenticated: false, modules: [], favorites: [], current: [], sharedNotes: [], blockedAccounts: [] };
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { configured: true, authenticated: false, modules: [], favorites: [], current: [], sharedNotes: [], blockedAccounts: [] };
  const [profileResult, modulesResult, showcaseResult, notesResult, blocksResult] = await Promise.all([
    client.from("profiles").select("username,display_name,tagline,bio,location,language,visibility_mode,connection_color,avatar_path,banner_path,selected_title,profile_palette_id,banner_mode,banner_position,overlay_strength,avatar_frame,surface_style,motif_intensity,banner_focal_x,banner_focal_y,banner_zoom,avatar_focal_x,avatar_focal_y,avatar_zoom,profile_theme_visibility,public_theme_preset,username_changed_at").eq("id", auth.user.id).maybeSingle(),
    client.from("profile_modules").select("module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order,config").eq("user_id", auth.user.id).order("mobile_order"),
    client.from("profile_media_showcase").select("showcase_kind,title,media_type,external_source,external_id,cover_url,world,sort_order").eq("user_id", auth.user.id).order("sort_order"),
    client.from("profile_shared_notes").select("id,media_title,media_type,external_source,external_id,content,contains_spoiler,visibility,created_at,updated_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
    client.rpc("list_social_blocks"),
  ]);
  const row = profileResult.data;
  const showcase = showcaseResult.data ?? [];
  const [avatarUrl, bannerUrl] = row
    ? await Promise.all([
      createSignedSocialAssetUrlWithClient(client, row.avatar_path, "avatar", row.avatar_path),
      createSignedSocialAssetUrlWithClient(client, row.banner_path, "banner", row.banner_path),
    ])
    : [undefined, undefined];
  return {
    configured: true,
    authenticated: true,
    profile: row?.username ? {
      username: row.username,
      displayName: row.display_name ?? row.username,
      tagline: row.tagline ?? "",
      bio: row.bio,
      location: row.location ?? undefined,
      language: row.language ?? undefined,
      visibilityMode: row.visibility_mode,
      connectionColor: colorOf(row.connection_color),
      selectedTitle: row.selected_title ?? undefined,
      presentation: normalizeProfilePresentationPreferences({
        version: 1,
        paletteId: row.profile_palette_id,
        bannerMode: row.banner_mode,
        bannerPosition: row.banner_position,
        overlayStrength: row.overlay_strength,
        avatarFrame: row.avatar_frame,
        surfaceStyle: row.surface_style,
        motifIntensity: row.motif_intensity,
        bannerTransform: { focalX: row.banner_focal_x, focalY: row.banner_focal_y, zoom: row.banner_zoom },
        avatarTransform: { focalX: row.avatar_focal_x, focalY: row.avatar_focal_y, zoom: row.avatar_zoom },
      }),
      themeSharing: {
        visibility: row.profile_theme_visibility,
        ...(row.public_theme_preset ? { publicPreset: row.public_theme_preset } : {}),
      },
      avatarUrl,
      bannerUrl,
      usernameChangedAt: row.username_changed_at ?? undefined,
    } : undefined,
    modules: modulesOf((modulesResult.data ?? []).map((item) => ({ moduleKey: item.module_key, enabled: item.enabled, visibility: item.visibility, gridX: item.grid_x, gridY: item.grid_y, gridWidth: item.grid_width, gridHeight: item.grid_height, mobileOrder: item.mobile_order, config: item.config }))),
    favorites: mediaOf(showcase.filter((item) => item.showcase_kind === "favorites").map((item) => ({ title: item.title, mediaType: item.media_type, externalSource: item.external_source, externalId: item.external_id, coverUrl: item.cover_url, world: item.world, sortOrder: item.sort_order })), 5),
    current: mediaOf(showcase.filter((item) => item.showcase_kind === "current").map((item) => ({ title: item.title, mediaType: item.media_type, externalSource: item.external_source, externalId: item.external_id, coverUrl: item.cover_url, world: item.world, sortOrder: item.sort_order })), 6),
    sharedNotes: (notesResult.data ?? []).map((item) => ({ id: item.id, mediaTitle: item.media_title, mediaType: item.media_type as SocialProfilePayload["sharedNotes"][number]["mediaType"], externalSource: item.external_source ?? undefined, externalId: item.external_id ?? undefined, content: item.content, containsSpoiler: item.contains_spoiler, visibility: item.visibility as SocialProfilePayload["sharedNotes"][number]["visibility"], createdAt: item.created_at, updatedAt: item.updated_at })),
    blockedAccounts: Array.isArray(blocksResult.data) ? blocksResult.data.flatMap((entry) => {
      const item = objectOf(entry);
      const id = stringOf(item?.id);
      const displayName = stringOf(item?.displayName);
      return id && displayName ? [{ id, displayName, username: stringOf(item?.username) }] : [];
    }) : [],
  };
}

export async function loadOwnSocialProfileSummary(): Promise<OwnProfileSummary> {
  const client = await getSupabaseServerClient();
  if (!client) return {};
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return {};
  const { data } = await client
    .from("profiles")
    .select("display_name,tagline,avatar_path,selected_title,avatar_focal_x,avatar_focal_y,avatar_zoom")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!data) return {};
  return {
    displayName: data.display_name ?? undefined,
    tagline: data.tagline ?? undefined,
    avatarUrl: await createSignedSocialAssetUrlWithClient(client, data.avatar_path, "avatar", data.avatar_path),
    selectedTitle: data.selected_title ?? undefined,
    avatarTransform: normalizeProfilePresentationPreferences({ version: 1, avatarTransform: { focalX: data.avatar_focal_x, focalY: data.avatar_focal_y, zoom: data.avatar_zoom } }).avatarTransform,
  };
}

export async function loadOwnProfileHeroData(): Promise<OwnProfileHeroData> {
  const client = await getSupabaseServerClient();
  if (!client) return {};
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return {};
  const { data } = await client
    .from("profiles")
    .select("username,display_name,tagline,bio,visibility_mode,avatar_path,banner_path,selected_title,profile_palette_id,banner_mode,banner_position,overlay_strength,avatar_frame,surface_style,motif_intensity,banner_focal_x,banner_focal_y,banner_zoom,avatar_focal_x,avatar_focal_y,avatar_zoom")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (!data) return {};
  const [avatarUrl, bannerUrl] = await Promise.all([
    createSignedSocialAssetUrlWithClient(client, data.avatar_path, "avatar", data.avatar_path),
    createSignedSocialAssetUrlWithClient(client, data.banner_path, "banner", data.banner_path),
  ]);
  const presentation = normalizeProfilePresentationPreferences({
    version: 1,
    paletteId: data.profile_palette_id,
    bannerMode: data.banner_mode,
    bannerPosition: data.banner_position,
    overlayStrength: data.overlay_strength,
    avatarFrame: data.avatar_frame,
    surfaceStyle: data.surface_style,
    motifIntensity: data.motif_intensity,
    bannerTransform: { focalX: data.banner_focal_x, focalY: data.banner_focal_y, zoom: data.banner_zoom },
    avatarTransform: { focalX: data.avatar_focal_x, focalY: data.avatar_focal_y, zoom: data.avatar_zoom },
  });
  return {
    username: data.username ?? undefined,
    displayName: data.display_name ?? data.username ?? undefined,
    tagline: data.tagline ?? undefined,
    bio: data.bio ?? undefined,
    visibilityMode: data.visibility_mode,
    avatarUrl,
    bannerUrl,
    selectedTitle: data.selected_title ?? undefined,
    avatarTransform: presentation.avatarTransform,
    presentation,
  };
}

export function toShowcaseJson(items: SocialMediaSnapshot[]): Json {
  return items.map((item) => ({
    title: item.title, media_type: item.mediaType, external_source: item.externalSource ?? "", external_id: item.externalId ?? "",
    cover_url: item.coverUrl ?? "", world: item.world, sort_order: item.sortOrder,
  }));
}
