import { nativeConfig } from '../backend/native-config';
import { nativeSignupEnabled } from './signup-policy';
import { PASSWORD_RESET_TTL } from './email-policy';
import { nativeSmtpConfig, nativeSmtpVariables } from './smtp-config';
export function nativeAuthOptions(env: Record<string, string | undefined>) {
  const config = nativeConfig(env);
  if (nativeSignupEnabled(env) || nativeSmtpVariables.some(name => env[name] !== undefined)) nativeSmtpConfig(env);
  return {
    secret: config.secret, baseURL: config.authUrl, basePath: '/api/auth',
    trustedOrigins: [config.authUrl],
    emailAndPassword: { enabled: true, disableSignUp: !nativeSignupEnabled(env),
      requireEmailVerification: true, autoSignIn: false, minPasswordLength: 8, maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TTL, revokeSessionsOnPasswordReset: true },
    verification: { storeIdentifier: 'hashed' as const },
    session: { cookieCache: { enabled: false }, deferSessionRefresh: true },
    advanced: { useSecureCookies: config.production, database: { generateId: 'uuid' as const },
      // No unverified forwarded IP headers. P1 uses a conservative shared bucket
      // until the native deployment has a verified ingress identity contract.
      ipAddress: { ipAddressHeaders: [] },
      cookiePrefix: 'mt-native', defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' as const, secure: config.production } },
    rateLimit: { enabled: true, storage: 'database' as const,
      // Shared across all visitors/processes; never keyed by submitted identity.
      customRules: { '/sign-up/email': { window: 3600, max: 5 },
        '/request-password-reset': { window: 3600, max: 5 }, '/send-verification-email': { window: 3600, max: 5 },
        '/reset-password': { window: 60, max: 5 }, '/verify-email': { window: 60, max: 10 } } },
    logger: { disabled: true },
  };
}
