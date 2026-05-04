"use client";

// ============================================
// useAuth Hook — Supabase Auth State
// ============================================
// Supabase yapılandırılmamışsa "configured=false" ile sessizce çalışır.
// Yapılandırılmışsa session'ı yükler ve auth değişikliklerini dinler.
// mediaItems / progressLogs ile hiçbir bağlantısı yoktur.

import { useEffect, useState } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface UseAuthState {
  configured: boolean;
  loading: boolean;
  user: User | null;
  session: Session | null;
}

export interface AuthActionResult {
  ok: boolean;
  error?: string;
}

export interface UseAuthApi extends UseAuthState {
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
}

function translateAuthError(err: AuthError | Error | null | undefined): string {
  if (!err) return "Bilinmeyen bir hata oluştu.";
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("invalid login")) return "E-posta veya şifre hatalı.";
  if (msg.includes("email not confirmed")) return "E-posta henüz doğrulanmadı. Gelen kutunu kontrol et.";
  if (msg.includes("user already registered") || msg.includes("already registered"))
    return "Bu e-posta zaten kayıtlı.";
  if (msg.includes("password should be at least"))
    return "Şifre en az 6 karakter olmalı.";
  if (msg.includes("rate limit") || msg.includes("too many"))
    return "Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.";
  if (msg.includes("network")) return "Ağ hatası. İnternet bağlantını kontrol et.";
  return err.message || "İşlem sırasında bir hata oluştu.";
}

export function useAuth(): UseAuthApi {
  // Client'ı bir kez kur. Module-level cache zaten aynı instance'ı döner.
  const [configured] = useState(() => getSupabaseBrowserClient() !== null);
  const [loading, setLoading] = useState(configured);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;

    let active = true;

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<AuthActionResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) return { ok: false, error: "Supabase yapılandırılmadı." };
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: translateAuthError(error) };
    return { ok: true };
  };

  const signUp = async (email: string, password: string): Promise<AuthActionResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) return { ok: false, error: "Supabase yapılandırılmadı." };
    const { error } = await client.auth.signUp({ email, password });
    if (error) return { ok: false, error: translateAuthError(error) };
    return { ok: true };
  };

  const signOut = async (): Promise<AuthActionResult> => {
    const client = getSupabaseBrowserClient();
    if (!client) return { ok: false, error: "Supabase yapılandırılmadı." };
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, error: translateAuthError(error) };
    return { ok: true };
  };

  return { configured, loading, user, session, signIn, signUp, signOut };
}
