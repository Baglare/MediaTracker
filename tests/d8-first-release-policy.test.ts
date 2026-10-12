import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const admission=vi.hoisted(()=>({enabled:false}));
vi.mock('@/hooks/use-auth',()=>({useAuth:()=>({configured:true,loading:false,user:null,signupEnabled:admission.enabled,signIn:vi.fn(),signOut:vi.fn(),signUp:vi.fn()})}));
import AuthPanel from '@/components/auth-panel';
afterEach(()=>{vi.unstubAllGlobals();admission.enabled=false;});

function source(path: string) {
  return readFileSync(path, "utf8");
}

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("D8 first-release fail-closed policy", () => {
  it("keeps public signup closed by default and preserves Supabase sign-in", () => {
    const panel = source("components/auth-panel.tsx");
    const auth = source("hooks/use-auth.ts");

    expect(panel).toContain("İlk sürümde yeni hesap kaydı kapalıdır.");
    expect(panel).toContain('const registering = register && signupEnabled');
    expect(auth).toContain("native && process.env.NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED === 'true'");
    expect(auth).toContain('if (!signupEnabled) return { ok: false');
    expect(auth).not.toContain('auth.signUp');
    expect(auth).toContain("signInWithPassword");
    expect(auth).toContain("signOut");
  });
  it('renders registration admission only after explicit enablement',()=>{
    vi.stubGlobal('React',React);
    const render=()=>renderToStaticMarkup(React.createElement(AuthPanel));
    expect(render()).toContain('İlk sürümde yeni hesap kaydı kapalıdır.');
    expect(render()).not.toContain('Yeni hesap oluştur');
    admission.enabled=true;
    expect(render()).toContain('Yeni hesap oluştur');
    expect(render()).not.toContain('İlk sürümde yeni hesap kaydı kapalıdır.');
  });

  it("requires an explicit on policy before the persistent cache can use service-role", () => {
    const cache = source("lib/ai/persistent-embedding-cache.ts");

    expect(cache).toContain('MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE !== "on"');
    expect(cache.indexOf('MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE !== "on"'))
      .toBeLessThan(cache.indexOf("SUPABASE_SERVICE_ROLE_KEY"));
    expect(cache).not.toContain("text_preview:");
  });

  it("keeps service-role out of the first-release app runtime except the disabled cache adapter", () => {
    const runtimeSources = [...sourceFiles("app"), ...sourceFiles("lib")]
      .filter((path) => source(path).includes("SUPABASE_SERVICE_ROLE_KEY"));

    expect(runtimeSources.map((path) => path.replaceAll("\\", "/")))
      .toEqual(["lib/ai/persistent-embedding-cache.ts"]);
    expect(source(runtimeSources[0])).toMatch(/^import "server-only";/);
  });
});
