import type { ProfilePreferences } from "@/lib/profile-preferences";

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
