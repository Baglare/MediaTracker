import 'server-only';
import { betterAuth } from 'better-auth';
import { getNativePool } from '../backend/postgres';
import { nativeAuthOptions } from './native-options';
function createNativeAuth() { return betterAuth({ ...nativeAuthOptions(process.env), database: getNativePool() }); }
let auth: ReturnType<typeof createNativeAuth> | undefined;
export function getNativeAuth() {
  return auth ??= createNativeAuth();
}
