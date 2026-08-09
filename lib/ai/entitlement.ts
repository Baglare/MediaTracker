import type { User } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface AiEntitlement {
  authenticated: boolean;
  isAdmin: boolean;
  canUseDeterministicAdvisor: boolean;
  canUseServerProviders: boolean;
  canUseOpenAi: boolean;
  canUseGroundedResearch: boolean;
}

export type AiServerAccessMode = "disabled" | "admin_only" | "authenticated";

export interface ResolvedAiEntitlement extends AiEntitlement {
  rateLimitIdentity: string;
}

export function readAiServerAccessMode(value = process.env.AI_SERVER_ACCESS_MODE): AiServerAccessMode {
  return value === "admin_only" || value === "authenticated" || value === "disabled"
    ? value
    : "disabled";
}

export function isServerVerifiedAdmin(user: Pick<User, "app_metadata"> | null | undefined) {
  const metadata = user?.app_metadata;
  if (!metadata || typeof metadata !== "object") return false;
  const role = metadata.role;
  const roles = metadata.roles;
  return metadata.is_admin === true
    || role === "admin"
    || (Array.isArray(roles) && roles.includes("admin"));
}

export function deriveAiEntitlement(
  user: Pick<User, "id" | "app_metadata"> | null | undefined,
  mode: AiServerAccessMode,
): ResolvedAiEntitlement {
  const authenticated = Boolean(user?.id);
  const isAdmin = authenticated && isServerVerifiedAdmin(user);
  const canUseServerProviders = mode === "authenticated"
    ? authenticated
    : mode === "admin_only"
      ? isAdmin
      : false;
  return {
    authenticated,
    isAdmin,
    canUseDeterministicAdvisor: true,
    canUseServerProviders,
    canUseOpenAi: canUseServerProviders,
    canUseGroundedResearch: canUseServerProviders,
    rateLimitIdentity: user?.id ? `user:${user.id}` : "guest",
  };
}

export async function resolveAiEntitlement(request: Request): Promise<ResolvedAiEntitlement> {
  void request;
  try {
    const client = await getSupabaseServerClient();
    if (!client) return deriveAiEntitlement(null, readAiServerAccessMode());
    const { data, error } = await client.auth.getUser();
    if (error) return deriveAiEntitlement(null, readAiServerAccessMode());
    return deriveAiEntitlement(data.user, readAiServerAccessMode());
  } catch {
    return deriveAiEntitlement(null, readAiServerAccessMode());
  }
}

export function toPublicAiEntitlement(value: ResolvedAiEntitlement): AiEntitlement {
  return {
    authenticated: value.authenticated,
    isAdmin: value.isAdmin,
    canUseDeterministicAdvisor: value.canUseDeterministicAdvisor,
    canUseServerProviders: value.canUseServerProviders,
    canUseOpenAi: value.canUseOpenAi,
    canUseGroundedResearch: value.canUseGroundedResearch,
  };
}
