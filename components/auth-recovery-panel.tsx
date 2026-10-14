"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { dashboardTabHref } from '@/components/app-shell/app-navigation';
import { nativeBrowserAuth } from '@/lib/auth/browser';

export type RecoveryMode = 'request' | 'verify' | 'reset';
export default function AuthRecoveryPanel({ mode, native }: { mode: RecoveryMode; native: boolean }) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (mode === 'request') return;
    const timer = window.setTimeout(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const value = params.get('token') ?? '';
    window.history.replaceState(null, '', window.location.pathname);
    if (params.getAll('token').length === 1 && /^[A-Za-z0-9_.-]{20,2048}$/.test(value)) setToken(value);
    else setMessage('Bağlantı geçersiz. Yeni bir bağlantı iste.');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode]);
  const submit = async (resend = false) => {
    if (busy || done) return;
    if (mode === 'reset' && (password.length < 8 || password.length > 128 || password !== confirmation)) {
      setMessage('Şifre 8–128 karakter olmalı ve tekrar alanıyla eşleşmeli.'); return;
    }
    setBusy(true); setMessage('');
    try {
      const result = mode === 'request' ? await (resend ? nativeBrowserAuth.resendVerification(email.trim()) : nativeBrowserAuth.requestPasswordReset(email.trim()))
        : mode === 'verify' ? await nativeBrowserAuth.verifyEmail(token) : await nativeBrowserAuth.resetPassword(token, password);
      if (!result.ok) setMessage(mode === 'request' ? 'İşlem şu anda tamamlanamadı. Daha sonra tekrar dene.' : 'Bağlantı geçersiz, kullanılmış veya süresi dolmuş olabilir. Yeni bir bağlantı iste.');
      else if (mode === 'request') setMessage('Adres uygunsa bağlantı gönderilecek. Gelen kutunu ve spam klasörünü kontrol et.');
      else { setDone(true); setToken(''); setPassword(''); setConfirmation(''); setMessage(mode === 'verify' ? 'E-posta doğrulandı. Hesabınla giriş yapabilirsin.' : 'Şifre güncellendi. Yeni şifrenle giriş yapabilirsin.'); }
    } catch { setMessage('İşlem şu anda tamamlanamadı. Daha sonra tekrar dene.'); }
    finally { setBusy(false); }
  };
  return <section className="app-panel mx-auto max-w-md rounded-2xl border p-6 space-y-4">
    <h1 className="text-xl font-semibold">{mode === 'request' ? 'Hesap erişimi' : mode === 'verify' ? 'E-posta doğrulaması' : 'Yeni şifre'}</h1>
    {!native ? <p>Bu akış yalnız native hesaplar için kullanılabilir.</p> : <form className="space-y-4" onSubmit={e => { e.preventDefault(); void submit(); }}>
      {mode === 'request' && <label className="block">E-posta<input className="app-input mt-2 w-full rounded-lg border p-2" type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>}
      {mode === 'reset' && !done && <>
        <label className="block">Yeni şifre<input className="app-input mt-2 w-full rounded-lg border p-2" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
        <label className="block">Şifreyi tekrar gir<input className="app-input mt-2 w-full rounded-lg border p-2" type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      </>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      {!done && <button className="app-primary-action w-full rounded-lg p-2 disabled:opacity-50" disabled={busy || (mode !== 'request' && !token)} type="submit">{busy ? 'Lütfen bekle…' : mode === 'request' ? 'Şifre sıfırlama bağlantısı iste' : mode === 'verify' ? 'Doğrula' : 'Şifreyi güncelle'}</button>}
      {mode === 'request' && <button className="w-full underline disabled:opacity-50" disabled={busy} type="button" onClick={e => { if (e.currentTarget.form?.reportValidity()) void submit(true); }}>Doğrulama e-postasını tekrar iste</button>}
    </form>}
    <Link href="/auth/recovery" className="block underline">Yeni bağlantı iste</Link>
    <Link href={dashboardTabHref('settings')} className="block underline">Hesap ayarlarına dön</Link>
  </section>;
}
