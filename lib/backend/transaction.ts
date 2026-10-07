import 'server-only';
import type { QueryResult, QueryResultRow } from 'pg';
import { getNativePool } from './postgres';
import { getCurrentUser } from '../auth/current-user';
import { supabaseApplicationError } from '../supabase/safe-error';

const contexts = new WeakSet<object>();
const externalWork = new WeakMap<object,Set<Promise<unknown>>>();
export interface AuthenticatedTransaction {
  readonly userId: string;
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
}
export function requireAuthenticatedTransaction(tx: AuthenticatedTransaction) {
  if (!contexts.has(tx)) throw new Error('transaction_context_required');
}
/** Drain bounded external IO before releasing its admission transaction on failure. */
export function withTransactionExternalWork<T>(tx:AuthenticatedTransaction,callback:()=>Promise<T>):Promise<T> {
  requireAuthenticatedTransaction(tx);
  const pending=externalWork.get(tx);
  if(!pending)throw new Error('transaction_context_expired');
  const work=callback();pending.add(work);
  return work.finally(()=>pending.delete(work));
}
/** No userId argument: identity comes only from server session verification. */
export async function withAuthenticatedTransaction<T>(callback: (tx: AuthenticatedTransaction) => Promise<T>): Promise<T> {
  return withApplicationTransaction(callback, true);
}
/** Anonymous public reads still verify the optional session and bind an empty identity. */
export async function withReadTransaction<T>(callback: (tx: AuthenticatedTransaction) => Promise<T>): Promise<T> {
  return withApplicationTransaction(callback, false);
}
async function withApplicationTransaction<T>(callback: (tx: AuthenticatedTransaction) => Promise<T>, authenticated: boolean): Promise<T> {
  const user = await getCurrentUser();
  if (!user && authenticated) throw new Error('authentication_required');
  let client;
  let discard = false;
  let active = true;
  const external = new Set<Promise<unknown>>();
  try {
    client = await getNativePool().connect();
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id', $1, true)", [user?.id ?? '']);
    const connection = client;
    const tx: AuthenticatedTransaction = Object.freeze({ userId: user?.id ?? '',
      query: <R extends QueryResultRow>(text: string, values?: unknown[]) => {
        if (!active) throw new Error('transaction_context_expired');
        return connection.query<R>(text, values);
      } });
    contexts.add(tx);
    externalWork.set(tx,external);
    const { bindNativeSocialLimiter } = await import('./limiter');
    await bindNativeSocialLimiter(tx);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error('transaction_timeout')), 10_000);
      });
      const result = await Promise.race([callback(tx), timeout]);
      active = false;
      contexts.delete(tx);
      await client.query('COMMIT');
      return result;
    } finally { if (deadline) clearTimeout(deadline); active = false; contexts.delete(tx); }
  } catch (error) {
    active=false;
    await Promise.allSettled([...external]);
    if (client) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
    }
    // Conservatively discard after any failed transaction (including timeout).
    discard = true;
    // Preserve only the public lifecycle denial; never propagate SQL diagnostics.
    throw supabaseApplicationError(error);
  } finally { client?.release(discard); }
}
