"use client";

// ============================================
// useAuth Hook — Supabase Auth State
// ============================================
// Supabase yapılandırılmamışsa "configured=false" ile sessizce çalışır.
// Yapılandırılmışsa session'ı yükler ve auth değişikliklerini dinler.
// mediaItems / progressLogs ile hiçbir bağlantısı yoktur.

import { useSyncExternalStore } from "react";
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

type AuthListener = () => void;
const authListeners = new Set<AuthListener>();
const authClient = getSupabaseBrowserClient();
let authSnapshot: UseAuthState = {
  configured: authClient !== null,
  loading: authClient !== null,
  user: null,
  session: null,
};
const serverAuthSnapshot: UseAuthState = { configured: false, loading: false, user: null, session: null };
let stopAuthSubscription: (() => void) | null = null;
let sessionRequest: Promise<void> | null = null;

function emitAuth() {
  authListeners.forEach((listener) => listener());
}

function updateAuth(session: Session | null) {
  authSnapshot = { configured: authClient !== null, loading: false, session, user: session?.user ?? null };
  emitAuth();
}

function startAuth() {
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
  return err.message || "İşlem sırasında bir hata oluştu.";
}

export function useAuth(): UseAuthApi {
  const state = useSyncExternalStore(subscribeAuth, () => authSnapshot, () => serverAuthSnapshot);

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

  return { ...state, signIn, signUp, signOut };
}
