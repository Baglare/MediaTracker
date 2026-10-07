import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types';
import { getBackendProvider } from './provider';

/** Domain compatibility surface only; native mode never constructs an SDK client. */
export async function getApplicationServerClient(): Promise<SupabaseClient<Database> | null> {
  if (getBackendProvider() === 'native') {
    const { createNativeDomainClient } = await import('./domain-client');
    return createNativeDomainClient() as unknown as SupabaseClient<Database>;
  }
  const { getSupabaseServerClient } = await import('../supabase/server');
  return getSupabaseServerClient();
}
