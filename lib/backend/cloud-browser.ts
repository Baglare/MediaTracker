import { getBackendProvider } from './provider';
import { getSupabaseBrowserClient } from '../supabase/client';

type Result = { data: unknown; error: { message: string } | null };
export async function nativeCloudRequest(input: Record<string, unknown>): Promise<Result> {
  try {
    const response = await fetch('/api/backend/cloud', { method: 'POST', credentials: 'same-origin',
      cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const body = await response.json();
    if (!response.ok) return { data: null, error: { message: body?.code === 'account_write_locked'
      ? 'account_write_locked' : 'cloud_operation_failed' } };
    return { data: body.data, error: null };
  } catch { return { data: null, error: { message: 'cloud_operation_failed' } }; }
}
export interface CloudRpcTransport {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Result>;
}
export function getCloudRpcClient(expectedUserId: string): CloudRpcTransport | null {
  if (getBackendProvider() === 'supabase') return getSupabaseBrowserClient() as unknown as CloudRpcTransport | null;
  return { rpc: (name: string, args: Record<string, unknown>) =>
    nativeCloudRequest({ action: 'rpc', expectedUserId, name, args }) };
}
export async function readNativeCloudRows(expectedUserId: string, table: 'media_items' | 'progress_logs' | 'goals', includeDeleted = false): Promise<Result> {
  const result = await nativeCloudRequest({ action: 'read', expectedUserId, table, includeDeleted });
  return result.error || Array.isArray(result.data) ? result
    : { data: null, error: { message: 'cloud_response_invalid' } };
}
