"use client";

// ============================================
// AuthPanel — Giriş / Hesap Kartı
// ============================================
// Supabase yapılandırılmamışsa yerel mod bilgisi gösterir.
// Yapılandırılmışsa yalnız mevcut hesaplar için giriş formu veya hesap özeti gösterir.
// mediaItems / progressLogs üzerinde hiçbir işlem yapmaz.

import { useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, Mail, ShieldCheck, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function AuthPanel() {
  const { configured, loading, user, signIn, signOut } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const cardCls =
    "app-panel rounded-2xl border p-6";

  // ---- Yapılandırılmamış ----
  if (!configured) {
    return (
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-zinc-500" />
          <h3 className="text-lg font-semibold text-zinc-100">Hesap</h3>
        </div>
        <p className="text-sm text-zinc-400">
          Supabase yapılandırılmadı. Uygulama yerel modda çalışıyor; verilerin yalnızca bu tarayıcıda saklanıyor.
        </p>
      </div>
    );
  }

  // ---- Yükleniyor ----
  if (loading) {
    return (
      <div className={cardCls}>
        <p className="text-sm text-zinc-500">Hesap durumu kontrol ediliyor…</p>
      </div>
    );
  }

  // ---- Giriş yapılmış ----
  if (user) {
    const handleSignOut = async () => {
      setSubmitting(true);
      setError(null);
      const res = await signOut();
      setSubmitting(false);
      if (!res.ok) setError(res.error ?? "Çıkış yapılamadı.");
    };

    return (
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <h3 className="text-lg font-semibold text-zinc-100">Hesap</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-4 h-4 text-zinc-500" />
            <span className="text-zinc-200 truncate">{user.email ?? "—"}</span>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            Yerel-first kayıtların korunur; Cloud Media ve Goal eşitlemesi bu hesap için etkin olduğunda değişiklikler güvenli kuyruk üzerinden senkronize edilir.
          </p>

          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/30 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {submitting ? "Çıkılıyor…" : "Çıkış Yap"}
          </button>
        </div>
      </div>
    );
  }

  // ---- Giriş yapılmamış: form ----
  const validate = (): string | null => {
    if (!email.trim()) return "E-posta boş olamaz.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Geçerli bir e-posta adresi gir.";
    if (!password) return "Şifre boş olamaz.";
    if (password.length < 6) return "Şifre en az 6 karakter olmalı.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    const res = await signIn(email.trim(), password);
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error ?? "İşlem başarısız.");
      return;
    }
  };

  const inputCls =
    "app-input w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm placeholder:text-[var(--app-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--app-focus)]";
  const labelCls = "block text-xs font-medium text-[var(--app-text-muted)] mb-1.5";

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-2">
          <LogIn className="w-5 h-5 text-violet-400" />
          <h3 className="text-lg font-semibold text-zinc-100">Giriş Yap</h3>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className={labelCls}>E-posta</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@mail.com"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Şifre</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 6 karakter"
              className={inputCls}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/30 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="app-primary-action w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer"
        >
          {submitting ? "Lütfen bekle…" : "Giriş Yap"}
        </button>

        <p className="text-[11px] text-zinc-500 leading-relaxed pt-1">
          İlk sürümde yeni hesap kaydı kapalıdır. Mevcut hesabınla giriş yapabilir; giriş yapmadan yerel-first kullanıma devam edebilirsin.
        </p>
        <Link href="/privacy" className="block text-center text-xs text-[var(--app-accent-strong)] underline underline-offset-4">
          Gizlilik ve veri kullanımı
        </Link>
      </form>
    </div>
  );
}
