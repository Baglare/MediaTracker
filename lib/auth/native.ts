import 'server-only';
import { betterAuth } from 'better-auth';
import { getNativePool } from '../backend/postgres';
import { nativeAuthOptions } from './native-options';
import { nativePassword } from './native-password';
function createNativeAuth() {
  const options = nativeAuthOptions(process.env);
  return betterAuth({ ...options, emailAndPassword: { ...options.emailAndPassword, password: nativePassword }, database: getNativePool() });
}
let auth: ReturnType<typeof createNativeAuth> | undefined;
export function getNativeAuth() {
  return auth ??= createNativeAuth();
}
