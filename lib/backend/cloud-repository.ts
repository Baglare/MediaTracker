import 'server-only';
import { requireAuthenticatedTransaction, type AuthenticatedTransaction } from './transaction';

const operations = {
  apply_media_item_sync_operation: ['p_operation_id','p_record_id','p_operation_type','p_expected_revision','p_payload'],
  apply_progress_log_sync_operation: ['p_operation_id','p_record_id','p_operation_type','p_expected_revision','p_payload'],
  apply_cloud_goal_v1: ['p_operation_id','p_goal_id','p_expected_revision','p_definition','p_delete'],
} as const;
export type NativeCloudTable = 'media_items' | 'progress_logs' | 'goals';
export function isNativeCloudTable(table: unknown): table is NativeCloudTable {
  return table === 'media_items' || table === 'progress_logs' || table === 'goals';
}
export async function executeNativeCloudOperation(tx: AuthenticatedTransaction, expectedUserId: string,
  name: string, args: Record<string, unknown>): Promise<unknown> {
  requireAuthenticatedTransaction(tx);
  if (expectedUserId !== tx.userId) throw new Error('owner_context_changed');
  if (!Object.hasOwn(operations, name)) throw new Error('operation_denied');
  const fields = operations[name as keyof typeof operations];
  if (Object.keys(args).length !== fields.length || fields.some(field => !Object.hasOwn(args, field))) {
    throw new Error('operation_invalid');
  }
  const types = name === 'apply_cloud_goal_v1' ? ['uuid','text','bigint','jsonb','boolean']
    : ['text','text','text','bigint','jsonb'];
  const values = fields.map((field, index) => types[index] === 'jsonb'
    ? (args[field] === null ? null : JSON.stringify(args[field])) : args[field]);
  // Identifier and argument ordering come exclusively from this static registry.
  const result = await tx.query(`SELECT app.${name}(${types.map((type,i) => `$${i+1}::${type}`).join(',')}) AS result`, values);
  return result.rows[0]?.result;
}
export async function readNativeCloudSnapshot(tx: AuthenticatedTransaction, expectedUserId: string,
  table: NativeCloudTable, includeDeleted = false): Promise<Record<string, unknown>[]> {
  requireAuthenticatedTransaction(tx);
  if (expectedUserId !== tx.userId) throw new Error('owner_context_changed');
  if (!isNativeCloudTable(table)) {
    throw new Error('operation_invalid');
  }
  const columns = table === 'goals' ? 'id,definition,revision,deleted_at' : '*';
  // One PostgreSQL cursor snapshot for the entire download. Independent HTTP
  // pages could lose records during concurrent edits and corrupt replace-local.
  await tx.query(`DECLARE native_cloud_snapshot NO SCROLL CURSOR FOR SELECT ${columns} FROM app.${table} WHERE user_id=$1::uuid${includeDeleted ? '' : ' AND deleted_at IS NULL'} ORDER BY id`, [tx.userId]);
  const rows: Record<string, unknown>[] = [];
  let bytes = 0;
  while (true) {
    const result = await tx.query('FETCH FORWARD 20 FROM native_cloud_snapshot');
    for (const row of result.rows) {
      const revision = Number(row.revision);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('revision_invalid');
      bytes += Buffer.byteLength(JSON.stringify(row));
      if (rows.length >= 10_000 || bytes > 16_777_216) throw new Error('cloud_snapshot_capacity_exceeded');
      rows.push({ ...row, revision });
    }
    if (result.rows.length < 20) break;
  }
  await tx.query('CLOSE native_cloud_snapshot');
  return rows;
}
