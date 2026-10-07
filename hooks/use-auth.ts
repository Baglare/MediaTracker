"use client";

// ============================================
// useAuth Hook — Supabase Auth State
// ============================================
// Supabase yapılandırılmamışsa "configured=false" ile sessizce çalışır.
// Yapılandırılmışsa session'ı yükler ve auth değişikliklerini dinler.
// mediaItems / progressLogs ile hiçbir bağlantısı yoktur.

import { useSyncExternalStore } from "react";
import type { Session, AuthError } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getBackendProvider } from "@/lib/backend/provider";
import type { ApplicationUser } from "@/lib/auth/identity";
import { nativeBrowserAuth } from "@/lib/auth/browser";

export interface UseAuthState {
  configured: boolean;
  loading: boolean;
  user: ApplicationUser | null;
  session: { user: ApplicationUser } | null;
}

export interface AuthActionResult {
  ok: boolean;
  error?: string;
}

export interface UseAuthApi extends UseAuthState {
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
}

type AuthListener = () => void;
const authListeners = new Set<AuthListener>();
const native = getBackendProvider() === "native";
const authClient = getSupabaseBrowserClient();
let authSnapshot: UseAuthState = {
  configured: native || authClient !== null,
  loading: native || authClient !== null,
  user: null,
  session: null,
};
const serverAuthSnapshot: UseAuthState = { configured: false, loading: false, user: null, session: null };
let stopAuthSubscription: (() => void) | null = null;
let sessionRequest: Promise<void> | null = null;
let nativeRequestVersion = 0;
async function refreshNative() {
  const version = ++nativeRequestVersion;
  let user: ApplicationUser | null = null;
  try { user = await nativeBrowserAuth.currentUser(); } catch { /* Fail closed. */ }
  if (version !== nativeRequestVersion) return;
  authSnapshot = { configured: true, loading: false, user, session: user ? { user } : null };
  emitAuth();
}

function emitAuth() {
  authListeners.forEach((listener) => listener());
}

function updateAuth(session: Session | null) {
  const source = session?.user;
  const metadata = source?.user_metadata;
  const user: ApplicationUser | null = source ? { id: source.id, email: source.email,
    user_metadata: { name: typeof metadata?.name === 'string' ? metadata.name : undefined,
      display_name: typeof metadata?.display_name === 'string' ? metadata.display_name : undefined } } : null;
  authSnapshot = { configured: authClient !== null, loading: false, session: user ? { user } : null, user };
  emitAuth();
}

function startAuth() {
  if (native) {
    if (!sessionRequest) sessionRequest = refreshNative();
    if (!stopAuthSubscription) {
      const revalidate = () => { void refreshNative(); };
      const unsubscribe = nativeBrowserAuth.subscribe(revalidate);
      stopAuthSubscription = () => { unsubscribe(); stopAuthSubscription = null; };
    }
    return;
  }
  if (!authClient) return;
  if (!sessionRequest) {
    sessionRequest = authClient.auth.getSession()
      .then(({ data }) => updateAuth(data.session))
      .catch(() => updateAuth(null));
  }
  if (!stopAuthSubscription) {
    const { data } = authClient.auth.onAuthStateChange((_event, session) => updateAuth(session));
    stopAuthSubscription = () => {
      data.subscription.unsubscribe();
      stopAuthSubscription = null;
    };
  }
}

function subscribeAuth(listener: AuthListener): () => void {
  authListeners.add(listener);
  startAuth();
  return () => {
    authListeners.delete(listener);
    if (authListeners.size === 0) {
      stopAuthSubscription?.();
      sessionRequest = null;
    }
  };
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
  return "İşlem sırasında bir hata oluştu.";
}

export function useAuth(): UseAuthApi {
  const state = useSyncExternalStore(subscribeAuth, () => authSnapshot, () => serverAuthSnapshot);

  const signIn = async (email: string, password: string): Promise<AuthActionResult> => {
    if (native) {
      const result = await nativeBrowserAuth.signIn(email, password);
      await refreshNative();
      return result;
    }
    const client = getSupabaseBrowserClient();
    if (!client) return { ok: false, error: "Supabase yapılandırılmadı." };
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: translateAuthError(error) };
    return { ok: true };
  };

  const signOut = async (): Promise<AuthActionResult> => {
    if (native) {
      const result = await nativeBrowserAuth.signOut();
      await refreshNative();
      return result;
    }
    const client = getSupabaseBrowserClient();
    if (!client) return { ok: false, error: "Supabase yapılandırılmadı." };
    const { error } = await client.auth.signOut();
    if (error) return { ok: false, error: translateAuthError(error) };
    return { ok: true };
  };

  return { ...state, signIn, signOut };
}
