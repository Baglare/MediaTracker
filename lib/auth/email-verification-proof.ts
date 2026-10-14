import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Better Auth 1.7.7 signs { email, iat, exp } with HS256; email changes are
// deliberately outside the native HTTP contract. Accept one encoding per JWT.
export function emailVerificationProof(token: string, secret: string, user: { id: string; email: string },
  env: Record<string, string | undefined>, now = Math.floor(Date.now() / 1000),
  purpose: 'email-verification' | 'email-verification-issue' = 'email-verification') {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(p => !p || !/^[A-Za-z0-9_-]+$/.test(p)
    || Buffer.from(p, 'base64url').toString('base64url') !== p)) throw new Error('invalid_verification_token');
  const signature = Buffer.from(parts[2], 'base64url');
  const expected = createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new Error('invalid_verification_token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (JSON.stringify(header) !== '{"alg":"HS256"}' || Object.keys(payload).sort().join(',') !== 'email,exp,iat'
    || payload.email !== user.email || !/^[0-9a-f-]{36}$/.test(user.id)
    || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
    || payload.iat > now || payload.exp <= now || payload.exp <= payload.iat || payload.exp - payload.iat > 3600)
    throw new Error('invalid_verification_token');
  const key = env.NATIVE_EMAIL_VERIFICATION_KEY;
  const epoch = env.NATIVE_EMAIL_VERIFICATION_EPOCH;
  if (!key || !/^[0-9a-f]{64}$/.test(key) || key === secret || !epoch || !/^[1-9][0-9]{0,9}$/.test(epoch))
    throw new Error('native_email_verification_configuration_invalid');
  if (payload.iat < Number(epoch)) throw new Error('invalid_verification_token');
  const replay = createHash('sha256').update(parts[0] + '.' + parts[1] + '.').update(signature).digest('hex');
  const envelope = JSON.stringify([1, user.id, user.email, purpose, payload.iat, payload.exp, Number(epoch), replay]);
  return { envelope, signature: createHmac('sha256', Buffer.from(key, 'hex')).update(envelope).digest('hex') };
}
