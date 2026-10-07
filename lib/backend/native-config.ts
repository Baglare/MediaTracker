export function nativeConfig(env: Record<string, string | undefined>) {
  const production = env.NODE_ENV === "production";
  try {
    const database = new URL(env.DATABASE_URL ?? "");
    const auth = new URL(env.BETTER_AUTH_URL ?? "");
    if (!['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname
      || !database.pathname.slice(1) || !database.username || database.search || database.hash
      || decodeURIComponent(database.username) !== "mt_runtime"
      || !['http:', 'https:'].includes(auth.protocol) || auth.username || auth.password
      || auth.pathname !== '/' || auth.search || auth.hash
      || (env.NEXT_PUBLIC_APP_URL !== undefined && env.NEXT_PUBLIC_APP_URL !== '' && env.NEXT_PUBLIC_APP_URL !== auth.origin)
      || (production && auth.protocol !== 'https:')
      || (env.BETTER_AUTH_SECRET?.length ?? 0) < 32
      || !['disable', 'verify-full'].includes(env.DATABASE_SSL_MODE ?? '')
      || (production && env.DATABASE_SSL_MODE !== 'verify-full')) throw new Error();
    const max = Number(env.DATABASE_POOL_MAX ?? '2');
    if (!Number.isInteger(max) || max < 1 || max > 5) throw new Error();
    return { databaseUrl: env.DATABASE_URL!, ssl: env.DATABASE_SSL_MODE === 'verify-full',
      max, authUrl: auth.origin, secret: env.BETTER_AUTH_SECRET!, production };
  } catch { throw new Error('native_configuration_invalid'); }
}
