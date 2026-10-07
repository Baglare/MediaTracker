import { nativeConfig } from '../backend/native-config';
export function nativeAuthOptions(env: Record<string, string | undefined>) {
  const config = nativeConfig(env);
  return {
    secret: config.secret, baseURL: config.authUrl, basePath: '/api/auth',
    trustedOrigins: [config.authUrl],
    emailAndPassword: { enabled: true, disableSignUp: true },
    session: { cookieCache: { enabled: false }, deferSessionRefresh: true },
    advanced: { useSecureCookies: config.production, database: { generateId: 'uuid' as const },
      // No unverified forwarded IP headers. P1 uses a conservative shared bucket
      // until the native deployment has a verified ingress identity contract.
      ipAddress: { ipAddressHeaders: [] },
      cookiePrefix: 'mt-native', defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' as const, secure: config.production } },
    rateLimit: { enabled: true, storage: 'database' as const },
    logger: { disabled: true },
  };
}
