import type { MediaItem, ProgressLog } from '../types';
import { buildCloudMediaV2Payload, buildCloudProgressV2Payload } from '../cloud-media-v2-client';
import { getCloudRpcClient, readNativeCloudRows } from './cloud-browser';

type TransferResult<T> = { ok: true; data: T } | { ok: false; error: string };
const failure = (message = 'cloud_operation_failed'): { ok: false; error: string } => ({ ok: false, error: message });
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export async function writeNativeCloudRows(userId: string, table: 'media_items' | 'progress_logs',
  items: readonly (MediaItem | ProgressLog)[]): Promise<TransferResult<{ count: number }>> {
  const current = await readNativeCloudRows(userId, table, true);
  if (current.error || !Array.isArray(current.data)) return failure();
  const revisions = new Map(current.data.filter(record).map(row => [row.id, row]));
  const client = getCloudRpcClient(userId);
  if (!client) return failure();
  let count = 0;
  for (const item of items) {
    const previous = revisions.get(item.id);
    if (previous?.deleted_at) return failure('cloud_tombstone_conflict');
    const { data, error } = await client.rpc(table === 'media_items' ? 'apply_media_item_sync_operation' : 'apply_progress_log_sync_operation', {
      p_operation_id: crypto.randomUUID(), p_record_id: item.id, p_operation_type: 'upsert',
      p_expected_revision: previous?.revision ?? 0, p_payload: table === 'media_items'
        ? buildCloudMediaV2Payload(userId, item as MediaItem) : buildCloudProgressV2Payload(userId, item as ProgressLog),
    });
    if (error) return failure(error.message === 'account_write_locked' ? error.message : 'cloud_operation_failed');
    if (!record(data) || data.ok !== true || data.conflict !== false || !Number.isSafeInteger(data.revision)) return failure('cloud_revision_conflict');
    revisions.set(item.id, { id: item.id, revision: data.revision, deleted_at: null });
    count++;
  }
  return { ok: true, data: { count } };
}
export async function deleteNativeCloudMedia(userId: string, id: string): Promise<TransferResult<{ count: number }>> {
  const current = await readNativeCloudRows(userId, 'media_items', true);
  if (current.error || !Array.isArray(current.data)) return failure();
  const row = current.data.find(value => record(value) && value.id === id);
  if (!record(row)) return { ok: true, data: { count: 0 } };
  if (row.deleted_at) return { ok: true, data: { count: 0 } };
  const client = getCloudRpcClient(userId);
  if (!client) return failure();
  const { data, error } = await client.rpc('apply_media_item_sync_operation', {
    p_operation_id: crypto.randomUUID(), p_record_id: id, p_operation_type: 'delete',
    p_expected_revision: row.revision, p_payload: null,
  });
  if (error) return failure(error.message === 'account_write_locked' ? error.message : 'cloud_operation_failed');
  return record(data) && data.ok === true && data.conflict === false
    ? { ok: true, data: { count: 1 } } : failure('cloud_revision_conflict');
}
