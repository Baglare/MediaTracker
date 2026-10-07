"use client";
import { createAuthClient } from 'better-auth/client';
import { applicationUser } from './identity';

// Browser code sees only same-origin HTTP; never pg or server configuration.
const client = createAuthClient({ basePath: '/api/auth' });
export const nativeBrowserAuth = {
  async currentUser() {
    const { data, error } = await client.getSession({ fetchOptions: { method: 'POST' } });
    if (error) throw new Error('auth_unavailable');
    return applicationUser(data?.user ?? null);
  },
  async signIn(email: string, password: string) {
    const { error } = await client.signIn.email({ email, password });
    return { ok: !error, ...(error ? { error: 'Oturum açılamadı.' } : {}) };
  },
  async signOut() {
    const { error } = await client.signOut({ fetchOptions: { body: {} } });
    return { ok: !error, ...(error ? { error: 'Oturum kapatılamadı.' } : {}) };
  },
  subscribe(listener: () => void) {
    // Mount Better Auth's own cross-tab/focus/session refresh machinery.
    return client.$store.atoms.session.subscribe(state => {
      if (!state.isPending && !state.isRefetching) listener();
    });
  },
};
