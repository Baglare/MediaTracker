import 'server-only';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
let active = 0;
/** Capacity control only; retain Better Auth's unchanged scrypt/password format. */
export async function withNativePasswordWork<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 2) throw new Error('native_auth_capacity');
  active++;
  try { return await work(); } finally { active--; }
}
export const nativePassword = {
  hash: (password: string) => withNativePasswordWork(() => hashPassword(password)),
  verify: (data: { password: string; hash: string }) => withNativePasswordWork(() => verifyPassword(data)),
};
