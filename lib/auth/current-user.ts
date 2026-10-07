import 'server-only';
import { getBackendProvider } from '../backend/provider';
import { applicationUser, type ApplicationUser } from './identity';

export async function getCurrentUser(): Promise<ApplicationUser | null> {
  try {
  if (getBackendProvider() === 'native') {
    const { headers } = await import('next/headers');
    const { getNativeAuth } = await import('./native');
    const session = await getNativeAuth().api.getSession({ headers: await headers(), query: { disableRefresh: true } });
    return applicationUser(session?.user ?? null);
  }
  const { getSupabaseServerClient } = await import('../supabase/server');
  const client = await getSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return applicationUser(data.user);
  } catch { throw new Error('auth_verification_failed'); }
}
