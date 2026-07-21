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

const BUCKET = "profile-assets";

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

async function signedAssetUrl(path: unknown): Promise<string | undefined> {
  const assetPath = stringOf(path);
  if (!assetPath) return undefined;
  const client = await getSupabaseServerClient();
  if (!client) return undefined;
  const { data, error } = await client.storage.from(BUCKET).createSignedUrl(assetPath, 300);
  return error ? undefined : data.signedUrl;
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
    bio: stringOf(record.bio) ?? "",
    location: stringOf(record.location),
    language: stringOf(record.language),
    visibilityMode: visibility as PublicSocialProfile["visibilityMode"],
    connectionColor: colorOf(record.connectionColor),
    joinedAt: stringOf(record.joinedAt) ?? new Date(0).toISOString(),
    selectedTitle: stringOf(record.selectedTitle),
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
  const { data, error } = await client.rpc("get_social_profile", { p_username: username });
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
  const [avatarUrl, bannerUrl] = await Promise.all([signedAssetUrl(rawProfile?.avatarPath), signedAssetUrl(rawProfile?.bannerPath)]);
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
  return {
    status: "available",
    profile: { ...profile, avatarUrl, bannerUrl },
    relationship,
    modules,
    favorites: visibleModules.has("favorites") ? mediaOf(root.favorites, 5) : [],
    current: visibleModules.has("current") ? mediaOf(root.current, 6) : [],
    stats: stats?.ok ? stats.value : undefined,
    progression: progression?.ok ? progression.value : undefined,
    sharedNotes: visibleModules.has("shared_notes") && Array.isArray(root.sharedNotes) ? root.sharedNotes as SocialProfilePayload["sharedNotes"] : [],
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
    avatarUrl: await signedAssetUrl(record.avatarPath),
    relationship: relationshipOf(record, profile.connectionColor),
  })));
}

export async function loadOwnSocialEditorData(): Promise<SocialProfileEditorData> {
  const client = await getSupabaseServerClient();
  if (!client) return { configured: false, authenticated: false, modules: [], favorites: [], current: [], sharedNotes: [], blockedAccounts: [] };
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return { configured: true, authenticated: false, modules: [], favorites: [], current: [], sharedNotes: [], blockedAccounts: [] };
  const [profileResult, modulesResult, showcaseResult, notesResult, blocksResult] = await Promise.all([
    client.from("profiles").select("username,display_name,bio,location,language,visibility_mode,connection_color,avatar_path,banner_path,selected_title,username_changed_at").eq("id", auth.user.id).maybeSingle(),
    client.from("profile_modules").select("module_key,enabled,visibility,grid_x,grid_y,grid_width,grid_height,mobile_order,config").eq("user_id", auth.user.id).order("mobile_order"),
    client.from("profile_media_showcase").select("showcase_kind,title,media_type,external_source,external_id,cover_url,world,sort_order").eq("user_id", auth.user.id).order("sort_order"),
    client.from("profile_shared_notes").select("id,media_title,media_type,external_source,external_id,content,contains_spoiler,visibility,created_at,updated_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }),
    client.rpc("list_social_blocks"),
  ]);
  const row = profileResult.data;
  const showcase = showcaseResult.data ?? [];
  return {
    configured: true,
    authenticated: true,
    profile: row?.username ? {
      username: row.username,
      displayName: row.display_name ?? row.username,
      bio: row.bio,
      location: row.location ?? undefined,
      language: row.language ?? undefined,
      visibilityMode: row.visibility_mode,
      connectionColor: colorOf(row.connection_color),
      selectedTitle: row.selected_title ?? undefined,
      avatarUrl: await signedAssetUrl(row.avatar_path),
      bannerUrl: await signedAssetUrl(row.banner_path),
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

export function toShowcaseJson(items: SocialMediaSnapshot[]): Json {
  return items.map((item) => ({
    title: item.title, media_type: item.mediaType, external_source: item.externalSource ?? "", external_id: item.externalId ?? "",
    cover_url: item.coverUrl ?? "", world: item.world, sort_order: item.sortOrder,
  }));
}
