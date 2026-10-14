import 'server-only';
import { betterAuth, type AuthContext } from 'better-auth';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { after } from 'next/server';
import { getNativePool } from '../backend/postgres';
import { nativeAuthOptions } from './native-options';
import { nativePassword } from './native-password';
import { nativeEmailOptions, smtpMailTransport } from './native-email';
import { emailVerificationProof } from './email-verification-proof';

function createNativeAuth() {
  const options = nativeAuthOptions(process.env);
  const mail = nativeEmailOptions(options.baseURL,
    async message => smtpMailTransport(process.env)(message), task => after(task), async (user, token) => {
      const proof = emailVerificationProof(token, options.secret, user, process.env, undefined, 'email-verification-issue');
      await getNativePool().query('SELECT native_auth.register_email_verification($1,$2)', [proof.envelope, proof.signature]);
    });
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
        try {
          if (typeof token !== 'string' || token.length > 2048) throw new Error();
          const email = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).email;
          if (typeof email !== 'string') throw new Error();
          const found = await ctx.context.internalAdapter.findUserByEmail(email);
          if (!found) throw new Error();
          const proof = emailVerificationProof(token, ctx.context.secret, found.user, process.env);
          await getNativePool().query('SELECT native_auth.verify_email($1,$2)', [proof.envelope, proof.signature]);
          return ctx.json({ status: true, user: null });
        } catch {
          throw new APIError('BAD_REQUEST', { code: 'INVALID_TOKEN', message: 'Invalid token' });
        }
      }
    }) }, database: getNativePool() });
  const context: Promise<Pick<AuthContext, 'internalAdapter'>> = instance.$context;
  return instance;
}
let auth: ReturnType<typeof createNativeAuth> | undefined;
export function getNativeAuth() {
  return auth ??= createNativeAuth();
}
