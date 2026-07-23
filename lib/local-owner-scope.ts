export type LocalOwnerScope =
  | { kind: "guest"; key: "guest"; storageKey: "guest" }
  | { kind: "user"; userId: string; key: `user:${string}`; storageKey: `user-${string}` };

const SAFE_USER_ID = /^[A-Za-z0-9_-]{1,128}$/;

export const GUEST_OWNER_SCOPE: LocalOwnerScope = {
  kind: "guest",
  key: "guest",
  storageKey: "guest",
};

export function createUserOwnerScope(userId: string): LocalOwnerScope {
  if (!SAFE_USER_ID.test(userId)) {
    throw new Error("invalid_local_owner_user_id");
  }
  return {
    kind: "user",
    userId,
    key: `user:${userId}`,
    storageKey: `user-${userId}`,
  };
}

export function resolveLocalOwnerScope(
  userId: string | null | undefined,
): LocalOwnerScope | null {
  if (userId === undefined) return null;
  return userId === null ? GUEST_OWNER_SCOPE : createUserOwnerScope(userId);
}

export function isLocalOwnerScope(value: unknown): value is LocalOwnerScope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalOwnerScope>;
  if (candidate.kind === "guest") {
    return candidate.key === "guest" && candidate.storageKey === "guest";
  }
  if (candidate.kind !== "user" || typeof candidate.userId !== "string") return false;
  return (
    SAFE_USER_ID.test(candidate.userId)
    && candidate.key === `user:${candidate.userId}`
    && candidate.storageKey === `user-${candidate.userId}`
  );
}

export function isHydratedOwnerVisible(
  activeScopeKey: string | null,
  hydratedScopeKey: string | null,
): boolean {
  return activeScopeKey !== null && activeScopeKey === hydratedScopeKey;
}

export function isCurrentOwnerGeneration(
  resultGeneration: number,
  currentGeneration: number,
): boolean {
  return resultGeneration === currentGeneration;
}
