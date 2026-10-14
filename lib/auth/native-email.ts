import 'server-only';
import nodemailer from 'nodemailer';
import { createHash } from 'node:crypto';
import { nativeSmtpConfig } from './smtp-config';
import { EMAIL_VERIFICATION_TTL } from './email-policy';
export const verificationIdentifier = (token: string) => `email-verification:${createHash('sha256').update(token).digest('hex')}`;
type Mail = { to: string; subject: string; text: string };
export type MailTransport = (mail: Mail) => Promise<void>;
type VerificationStore = {
  createVerificationValue: (value: { identifier: string; value: string; expiresAt: Date }) => Promise<unknown>;
  consumeVerificationValue: (identifier: string) => Promise<unknown>;
};

export function smtpMailTransport(env: Record<string, string | undefined>): MailTransport {
  const { from, ...config } = nativeSmtpConfig(env);
  const transport = nodemailer.createTransport(config);
  return async mail => {
    try {
      const result = await transport.sendMail({ ...mail, from });
      if (result.rejected.length || result.accepted.length !== 1) throw new Error();
    } catch { throw new Error('native_auth_mail_delivery_failed'); }
  };
}

// The official Better Auth callbacks own token issuance. SMTP runs after the HTTP
// response so delivery time/failure cannot disclose whether an address exists.
export function nativeEmailOptions(origin: string, store: () => Promise<VerificationStore>,
  send: MailTransport, schedule: (task: () => Promise<void>) => void) {
  const enqueue = (mail: Mail) => schedule(async () => {
    try { await send(mail); }
    catch { console.error('native_auth_mail_delivery_failed'); }
  });
  return {
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: false, autoSignInAfterVerification: false,
      expiresIn: EMAIL_VERIFICATION_TTL,
      async sendVerificationEmail({ user, token }: { user: { id: string; email: string }; token: string }) {
        await (await store()).createVerificationValue({ identifier: verificationIdentifier(token),
          value: user.id, expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL * 1000) });
        enqueue({ to: user.email, subject: 'MediaTracker — E-posta doğrulaması',
          text: `E-posta adresini doğrulamak için bağlantıyı aç ve Doğrula düğmesine bas. Bağlantı 1 saat geçerlidir.\n${origin}/auth/verify#token=${encodeURIComponent(token)}\nBu işlemi istemediysen bu mesajı yok say.` });
      },
    },
    emailAndPassword: {
      async sendResetPassword({ user, token }: { user: { id: string; email: string }; token: string }) {
        enqueue({ to: user.email, subject: 'MediaTracker — Şifre sıfırlama',
          text: `Yeni şifreni belirlemek için bağlantıyı aç. Bağlantı 30 dakika geçerlidir.\n${origin}/auth/reset#token=${encodeURIComponent(token)}\nBu işlemi istemediysen bu mesajı yok say.` });
      },
    },
  };
}
