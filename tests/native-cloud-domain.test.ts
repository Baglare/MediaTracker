import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api/distributed-rate-limit',()=>({enforceDistributedRateLimit:vi.fn(async()=>null)}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), connect: vi.fn(), query: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: mocks.user }));
vi.mock('@/lib/backend/postgres', () => ({ getNativePool: () => ({ connect: mocks.connect }) }));
import { withAuthenticatedTransaction, type AuthenticatedTransaction } from '@/lib/backend/transaction';
import { executeNativeCloudOperation, readNativeCloudSnapshot } from '@/lib/backend/cloud-repository';
import { POST } from '@/app/api/backend/cloud/route';
import { resolveTrustedIngress } from '@/lib/api/rate-limit-identity';
const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const mediaArgs = { p_operation_id: 'persistent-operation', p_record_id: 'local-id', p_operation_type: 'upsert', p_expected_revision: 3, p_payload: { title: 'Synthetic' } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BACKEND_PROVIDER', 'native');
  vi.stubEnv('NEXT_PUBLIC_BACKEND_PROVIDER', 'native');
  mocks.user.mockResolvedValue({ id: user });
  mocks.query.mockResolvedValue({ rows: [{ result: { ok: true, revision: 4 } }], rowCount: 1 });
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
});
afterEach(() => vi.unstubAllEnvs());
function request(body: unknown, origin = 'https://app.example.invalid') {
  return new Request('https://app.example.invalid/api/backend/cloud', { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
describe('native Cloud/Goal admission', () => {
  it('rejects forged contexts before querying', async () => {
    const forged = { userId: user, query: mocks.query } as AuthenticatedTransaction;
    await expect(executeNativeCloudOperation(forged, user, 'apply_media_item_sync_operation', mediaArgs)).rejects.toThrow('transaction_context_required');
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('uses the existing atomic SQL operation and persistent queue identity', async () => {
    const result = await withAuthenticatedTransaction(tx => executeNativeCloudOperation(tx, user, 'apply_media_item_sync_operation', mediaArgs));
    expect(result).toEqual({ ok: true, revision: 4 });
    expect(mocks.query).toHaveBeenCalledWith('SELECT app.apply_media_item_sync_operation($1::text,$2::text,$3::text,$4::bigint,$5::jsonb) AS result',
      ['persistent-operation','local-id','upsert',3,JSON.stringify(mediaArgs.p_payload)]);
    expect(mocks.release).toHaveBeenCalledWith(false);
  });
  it.each(['pg_sleep', 'transition_account', 'apply_media_item_sync_operation); DROP TABLE app.media_items; --'])('rejects arbitrary SQL/RPC %s', async name => {
    await expect(withAuthenticatedTransaction(tx => executeNativeCloudOperation(tx, user, name, mediaArgs))).rejects.toThrow('database_operation_failed');
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes(`app.${name}`))).toBe(false);
  });
  it('rejects spoofed/stale owner before any domain statement', async () => {
    await expect(withAuthenticatedTransaction(tx => executeNativeCloudOperation(tx, other, 'apply_media_item_sync_operation', mediaArgs))).rejects.toThrow();
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('apply_media'))).toBe(false);
  });
  it('rejects extra authenticated-owner fields inside the RPC payload', async () => {
    await expect(withAuthenticatedTransaction(tx => executeNativeCloudOperation(tx, user, 'apply_media_item_sync_operation', { ...mediaArgs, p_user_id: other }))).rejects.toThrow();
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('apply_media'))).toBe(false);
  });
  it('retains Goal operation IDs/CAS and lets SQL own receipts', async () => {
    await withAuthenticatedTransaction(tx => executeNativeCloudOperation(tx, user, 'apply_cloud_goal_v1', {
      p_operation_id: other, p_goal_id: 'goal', p_expected_revision: 2, p_definition: null, p_delete: true,
    }));
    expect(mocks.query).toHaveBeenCalledWith('SELECT app.apply_cloud_goal_v1($1::uuid,$2::text,$3::bigint,$4::jsonb,$5::boolean) AS result', [other,'goal',2,null,true]);
  });
  it('bounds owner reads and decodes pg bigint revisions for existing clients', async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: 'goal', revision: '7', definition: {}, deleted_at: null }] });
    const data = await withAuthenticatedTransaction(tx => readNativeCloudSnapshot(tx, user, 'goals', true));
    expect(data[0].revision).toBe(7);
    expect(mocks.query).toHaveBeenCalledWith('DECLARE native_cloud_snapshot NO SCROLL CURSOR FOR SELECT id,definition,revision,deleted_at FROM app.goals WHERE user_id=$1::uuid ORDER BY id', [user]);
    expect(mocks.query).toHaveBeenCalledWith('CLOSE native_cloud_snapshot', undefined);
  });
  it('rejects unsafe revision precision', async () => {
    mocks.query.mockResolvedValue({ rows: [{ revision: '9007199254740993' }] });
    await expect(withAuthenticatedTransaction(tx => readNativeCloudSnapshot(tx, user, 'goals'))).rejects.toThrow();
  });
  it('rejects a snapshot exceeding the memory budget instead of returning a truncated library', async () => {
    mocks.query.mockResolvedValue({ rows: Array.from({ length: 20 }, () => ({ revision: '1', metadata: 'x'.repeat(1_048_576) })) });
    await expect(withAuthenticatedTransaction(tx => readNativeCloudSnapshot(tx, user, 'media_items'))).rejects.toThrow('database_operation_failed');
    expect(mocks.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.query).not.toHaveBeenCalledWith('COMMIT');
    expect(mocks.release).toHaveBeenCalledWith(true);
  });
  it('retains lifecycle write denial without leaking raw database errors', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('apply_media_item')) throw new Error('account_write_locked');
      return { rows: [] };
    });
    const response = await POST(request({ action: 'rpc', expectedUserId: user, name: 'apply_media_item_sync_operation', args: mediaArgs }));
    expect(response.status).toBe(423);
    expect(await response.json()).toEqual({ code: 'account_write_locked' });
  });
  it('denies unauthenticated before acquiring a connection', async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request({ action: 'read', expectedUserId: user }))).status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('denies cross-origin before session/DB work', async () => {
    expect((await POST(request({}, 'https://attacker.example.invalid'))).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it('rejects unknown outer owner credentials', async () => {
    expect((await POST(request({ action: 'rpc', userId: other }))).status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
});
describe('trusted ingress source contract', () => {
  it.each(['x-forwarded-for','x-real-ip','cf-connecting-ip'])('never trusts arbitrary %s on Passenger', name => {
    const req = new Request('https://app.example.invalid', { headers: { [name]: '198.51.100.1' } });
    expect(resolveTrustedIngress(req, { NODE_ENV: 'production', BACKEND_PROVIDER: 'native', TRUSTED_INGRESS_MODE: 'passenger' }))
      .toEqual({ platform: 'passenger', status: 'unavailable', ip: null });
  });
  it('accepts only explicitly configured local/test identity outside production', () => {
    expect(resolveTrustedIngress(request({}), { TRUSTED_INGRESS_MODE: 'local-test', RATE_LIMIT_LOCAL_TEST_IP: '127.0.0.1' }).ip).toBe('127.0.0.1');
    expect(resolveTrustedIngress(request({}), { NODE_ENV: 'production', TRUSTED_INGRESS_MODE: 'local-test', RATE_LIMIT_LOCAL_TEST_IP: '127.0.0.1' }).ip).toBe(null);
    expect(resolveTrustedIngress(request({}), { NODE_ENV: 'production', BACKEND_PROVIDER: 'native', VERCEL: '1' }).ip).toBe(null);
  });
});
it('native Cloud SQL retains owner RLS, atomic receipts, immutable progress and CAS', () => {
  const sql = readFileSync('database/native/004_cloud_goals.sql', 'utf8');
  expect(sql).not.toMatch(/auth\.uid\(|auth\.users|storage\.|vault\.|service_role|TO authenticated/i);
  for (const table of ['media_items','progress_logs','cloud_media_sync_operations','goals','goal_sync_operations']) {
    expect(sql).toContain(`ALTER TABLE app.${table} FORCE ROW LEVEL SECURITY`);
    expect(sql).toContain(`GRANT SELECT ON app.${table} TO mt_runtime`);
  }
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain('immutable_log_conflict');
  expect(sql).toContain('cloud_operation_id_reused');
  expect(sql).toContain('idempotent_replay');
  expect(sql).toContain('request_hash');
  expect(sql).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON app\.(?:media_items|progress_logs|goals) TO mt_runtime/i);
});
