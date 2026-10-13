import type { ProfilePreferences } from "@/lib/profile-preferences";
import { validateImageUpload } from "./validation";

/** Decode locally: fetching a data URL is blocked by the production connect-src policy. */
export function localAvatarDataUrlToFile(dataUrl: string): File {
  const invalid = () => new Error("Yerel profil fotoğrafı okunamadı. Resmi yeniden seçebilirsin.");
  if (dataUrl.length > Math.ceil(5 * 1024 * 1024 / 3) * 4 + 64) throw invalid();
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw invalid();
  let decoded: string;
  try { decoded = atob(match[2]); } catch { throw invalid(); }
  const validation = validateImageUpload("avatar", match[1], decoded.length);
  if (!validation.ok) throw new Error(validation.error);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  const extension = match[1] === "image/png" ? "png" : match[1] === "image/webp" ? "webp" : "jpg";
  return new File([bytes], `profile-avatar.${extension}`, { type: match[1] });
}

export type AvatarSource = "social" | "local" | "preset" | "initials";

export interface ResolvedAvatar {
  source: AvatarSource;
  imageUrl?: string;
}

export function resolveAvatarSource(args: {
  socialAvatarUrl?: string;
  localPreferences?: Pick<ProfilePreferences, "avatarMode" | "avatarImageDataUrl">;
  allowLocalFallback: boolean;
}): ResolvedAvatar {
  if (args.socialAvatarUrl) return { source: "social", imageUrl: args.socialAvatarUrl };
  if (!args.allowLocalFallback || !args.localPreferences) return { source: "initials" };
  if (args.localPreferences.avatarMode === "image" && args.localPreferences.avatarImageDataUrl) {
    return { source: "local", imageUrl: args.localPreferences.avatarImageDataUrl };
  }
  return { source: args.localPreferences.avatarMode === "preset" ? "preset" : "initials" };
}

export function shouldOfferLocalAvatarMigration(args: {
  authenticated: boolean;
  hasSocialProfile: boolean;
  socialAvatarUrl?: string;
  localAvatarDataUrl?: string;
  dismissed: boolean;
}): boolean {
  return args.authenticated
    && args.hasSocialProfile
    && !args.socialAvatarUrl
    && Boolean(args.localAvatarDataUrl)
    && !args.dismissed;
}

export async function migrateLocalAvatar<T>(args: {
  confirmed: boolean;
  localAvatarDataUrl?: string;
  upload: (dataUrl: string) => Promise<T>;
}): Promise<{ status: "skipped" } | { status: "uploaded"; value: T }> {
  if (!args.confirmed || !args.localAvatarDataUrl?.startsWith("data:image/")) return { status: "skipped" };
  return { status: "uploaded", value: await args.upload(args.localAvatarDataUrl) };
}
