import { getBackendProvider } from '@/lib/backend/provider';
import { withAuthenticatedTransaction } from '@/lib/backend/transaction';
import { executeNativeCloudOperation, isNativeCloudTable, readNativeCloudSnapshot } from '@/lib/backend/cloud-repository';
import { validateAuthenticatedMutationRequest, readStrictJsonObject } from '@/lib/api/request-security';
import { getCurrentUser } from '@/lib/auth/current-user';
import { runSafeApiRoute } from '@/lib/api/safe-route';
import { enforceDistributedRateLimit } from '@/lib/api/distributed-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const fail = (code: string, status: number) => Response.json({ code }, { status, headers });
export async function POST(request: Request): Promise<Response> {
  return runSafeApiRoute("/api/backend/cloud", "POST", async () => {
  try {
    if (getBackendProvider() !== 'native') return fail('native_backend_inactive',404);
    const boundary = validateAuthenticatedMutationRequest(request);
    if (boundary) return boundary;
    if (!await getCurrentUser()) return fail('authentication_required',401);
    const admission=await enforceDistributedRateLimit(request,'social_write');
    if(admission)return admission;
    const parsed = await readStrictJsonObject(request,
      new Set(['action','expectedUserId','name','args','table','includeDeleted','recordId']), 1_048_576);
    if (!parsed.ok) return parsed.response;
    const input = parsed.value;
    if (typeof input.expectedUserId !== 'string') return fail('operation_invalid',400);
    const data = await withAuthenticatedTransaction(async tx => {
      // Client owner is only a stale-session guard. Server-verified tx.userId authorizes.
      if (input.expectedUserId !== tx.userId) throw new Error('owner_context_changed');
      if(input.action==='summary' && (input.table==='media_items' || input.table==='progress_logs')
        && typeof input.recordId==='string' && input.recordId.length>0 && input.recordId.length<=300
        && Object.keys(input).every(k=>['action','expectedUserId','table','recordId'].includes(k))) {
        const columns=input.table==='media_items'?'id,title,status,current_progress,total_progress,revision,deleted_at':'id,media_title,new_progress,revision,deleted_at';
        const row=(await tx.query(`SELECT ${columns} FROM app.${input.table} WHERE user_id=$1::uuid AND id=$2::text`,[tx.userId,input.recordId])).rows[0];
        return row?{...row,revision:Number(row.revision)}:null;
      }
      if (input.action === 'rpc' && typeof input.name === 'string' && input.args && typeof input.args === 'object'
        && !Array.isArray(input.args) && Object.keys(input).every(k => ['action','expectedUserId','name','args'].includes(k))) {
        return executeNativeCloudOperation(tx, tx.userId, input.name, input.args as Record<string, unknown>);
      }
      if (input.action === 'read' && isNativeCloudTable(input.table)
        && typeof input.includeDeleted === 'boolean' && Object.keys(input).every(k => ['action','expectedUserId','table','includeDeleted'].includes(k))) {
        return readNativeCloudSnapshot(tx, tx.userId, input.table, input.includeDeleted);
      }
      throw new Error('operation_invalid');
    });
    return Response.json({ data }, { headers });
  } catch (error) {
    return fail(error instanceof Error && error.message === 'account_write_locked' ? 'account_write_locked' : 'cloud_operation_failed',
      error instanceof Error && error.message === 'account_write_locked' ? 423 : 503);
  }
  });
}
