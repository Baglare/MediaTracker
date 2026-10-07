export interface ApplicationUser {
  id: string;
  email?: string;
  /** Display only; never an authorization input. */
  user_metadata?: { name?: string; display_name?: string };
}
export function applicationUser(user: { id: string; email?: string; name?: string } | null): ApplicationUser | null {
  if (!user) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) throw new Error('identity_invalid');
  return { id: user.id, email: user.email, ...(user.name ? { user_metadata: { name: user.name } } : {}) };
}
