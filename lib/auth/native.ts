import 'server-only';
import { betterAuth, type AuthContext } from 'better-auth';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { after } from 'next/server';
import { getNativePool } from '../backend/postgres';
import { nativeAuthOptions } from './native-options';
import { nativePassword } from './native-password';
import { nativeEmailOptions, smtpMailTransport, verificationIdentifier } from './native-email';

function createNativeAuth() {
  const options = nativeAuthOptions(process.env);
  const mail = nativeEmailOptions(options.baseURL, async () => (await context).internalAdapter,
    async message => smtpMailTransport(process.env)(message), task => after(task));
  const instance = betterAuth({ ...options, emailVerification: mail.emailVerification,
    emailAndPassword: { ...options.emailAndPassword, ...mail.emailAndPassword, password: nativePassword },
    databaseHooks: { session: { create: { before: async session => {
      const user = await (await context).internalAdapter.findUserById(session.userId);
      if (user?.emailVerified !== true) return false;
      return { data: session };
    } } } },
    hooks: { before: createAuthMiddleware(async ctx => {
      if (ctx.path === '/verify-email') {
        const token = ctx.query?.token;
        if (typeof token !== 'string' || !(await ctx.context.internalAdapter.consumeVerificationValue(verificationIdentifier(token))))
          throw new APIError('BAD_REQUEST', { code: 'INVALID_TOKEN', message: 'Invalid token' });
      }
    }) }, database: getNativePool() });
  const context: Promise<Pick<AuthContext, 'internalAdapter'>> = instance.$context;
  return instance;
}
let auth: ReturnType<typeof createNativeAuth> | undefined;
export function getNativeAuth() {
  return auth ??= createNativeAuth();
}
