export const nativeSmtpVariables = ['NATIVE_SMTP_HOST', 'NATIVE_SMTP_PORT', 'NATIVE_SMTP_SECURITY', 'NATIVE_SMTP_USER', 'NATIVE_SMTP_PASSWORD', 'NATIVE_SMTP_FROM'];

// Explicit TLS only. No URL, plaintext port, certificate bypass or client configuration.
export function nativeSmtpConfig(env: Record<string, string | undefined>) {
  try {
    const host = env.NATIVE_SMTP_HOST ?? '';
    const user = env.NATIVE_SMTP_USER ?? '';
    const password = env.NATIVE_SMTP_PASSWORD ?? '';
    const from = env.NATIVE_SMTP_FROM ?? '';
    const secure = env.NATIVE_SMTP_SECURITY === 'tls';
    if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)
      || host.includes('..') || !host.includes('.')
      || !['tls', 'starttls'].includes(env.NATIVE_SMTP_SECURITY ?? '')
      || env.NATIVE_SMTP_PORT !== (secure ? '465' : '587')
      || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(from) || from.length > 254
      || !user || user.length > 254 || /[\r\n\0]/.test(user)
      || !password || password.length > 1024 || /[\r\n\0]/.test(password)) throw new Error();
    return { host, port: secure ? 465 : 587, secure, requireTLS: !secure,
      auth: { user, pass: password }, from,
      tls: { minVersion: 'TLSv1.2' as const, rejectUnauthorized: true, servername: host },
      connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 5000,
      disableFileAccess: true, disableUrlAccess: true, logger: false as const, debug: false };
  } catch { throw new Error('native_smtp_configuration_invalid'); }
}
