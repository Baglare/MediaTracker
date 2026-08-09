import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { providerUserAgent } from "@/lib/api/provider-identity";

describe("D8 staging target safety", () => {
  it("fails closed without explicit staging gates and rejects equal refs", async () => {
    const { resolveSafeStagingTarget } = await import("../scripts/d8-staging-target.mjs");
    expect(() => resolveSafeStagingTarget({})).toThrow("safety gate closed");
    expect(() => resolveSafeStagingTarget({
      D8_STAGING_CUTOVER_ENABLED: "1",
      D8_STAGING_PROJECT_REF: "same-project",
      D8_PRODUCTION_PROJECT_REF: "same-project",
      D8_STAGING_DATABASE_URL: "postgresql://user:secret@same-project.example.test/db",
    })).toThrow("refs match");
  });

  it("accepts only a database host bound to the explicit non-production ref", async () => {
    const { resolveSafeStagingTarget } = await import("../scripts/d8-staging-target.mjs");
    expect(() => resolveSafeStagingTarget({
      D8_STAGING_CUTOVER_ENABLED: "1",
      D8_STAGING_PROJECT_REF: "stage-project",
      D8_PRODUCTION_PROJECT_REF: "prod-project",
      D8_STAGING_DATABASE_URL: "postgresql://user:secret@prod-project.example.test/db",
    })).toThrow("not bound");

    expect(resolveSafeStagingTarget({
      D8_STAGING_CUTOVER_ENABLED: "1",
      D8_STAGING_MIGRATION_ALLOWED: "1",
      D8_STAGING_PROJECT_REF: "stage-project",
      D8_PRODUCTION_PROJECT_REF: "prod-project",
      D8_STAGING_DATABASE_URL: "postgresql://postgres.stage-project:secret@pooler.example.test/db",
    }, { requireMigrationPermission: true }).databaseUrl.hostname).toBe("pooler.example.test");
  });
});

describe("D8 release UI/provider contracts", () => {
  it("keeps public navigation accessible and collapses labels below sm", () => {
    const source = readFileSync("components/app-shell/app-shell.tsx", "utf8");
    expect(source).toContain('aria-label="Kullanıcı ara"');
    expect(source).toContain('aria-label="Uygulamaya dön"');
    expect(source.match(/sr-only sm:not-sr-only/g)).toHaveLength(2);
  });

  it("only accepts bounded printable provider identification", () => {
    expect(providerUserAgent("MediaTracker/0.1 (contact@example.test)")).toContain("MediaTracker");
    expect(providerUserAgent("bad\r\nheader")).toBeNull();
    expect(providerUserAgent("short")).toBeNull();
  });
});
