import 'server-only';
import { getCurrentUser } from '../auth/current-user';
import { withAuthenticatedTransaction } from './transaction';
import { accountExport } from '../privacy/account-export.mjs';
/** No target argument: own-account export with the existing explicit allowlists and sanitizer. */
export async function exportNativeAccount() {
  const user=await getCurrentUser();
  if(!user?.email)throw new Error('authentication_required');
  return withAuthenticatedTransaction(async tx=>{
    if(tx.userId!==user.id)throw new Error('owner_context_changed');
    const snapshot=(await tx.query('SELECT app.native_account_export_snapshot() AS result')).rows[0]?.result;
    return accountExport(snapshot,user.id,user.email,new Date().toISOString());
  });
}
