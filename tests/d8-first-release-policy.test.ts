import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
  it("exposes sign-in without shipping a public signup action", () => {
    const panel = source("components/auth-panel.tsx");
    const auth = source("hooks/use-auth.ts");

    expect(panel).toContain("İlk sürümde yeni hesap kaydı kapalıdır.");
    expect(panel).not.toMatch(/Kayıt [Oo]l|signUp|passwordConfirm/);
    expect(auth).not.toMatch(/signUp|auth\.signUp/);
    expect(auth).toContain("signInWithPassword");
    expect(auth).toContain("signOut");
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
