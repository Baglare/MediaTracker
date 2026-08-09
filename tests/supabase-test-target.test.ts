import { describe, expect, it } from "vitest";
import { assertSafeSupabaseTestTarget } from "@/lib/supabase-test-target";

describe("Supabase live-test target guard", () => {
  it("accepts an explicit non-production HTTP target", () => {
    expect(() => assertSafeSupabaseTestTarget(
      "https://test-project.supabase.co",
      ["https://production.supabase.co"],
    )).not.toThrow();
  });

  it("refuses the production project regardless of URL path", () => {
    expect(() => assertSafeSupabaseTestTarget(
      "https://production.supabase.co/rest/v1",
      ["https://production.supabase.co"],
    )).toThrow(/refused/i);
  });

  it("refuses malformed targets", () => {
    expect(() => assertSafeSupabaseTestTarget("not-a-url", []))
      .toThrow(/HTTP/);
  });

  it("refuses an unlabelled project ref even when it differs from production", () => {
    expect(() => assertSafeSupabaseTestTarget(
      "https://abcdefghijklmnopqrst.supabase.co",
      ["https://production.supabase.co"],
    )).toThrow(/marked/i);
  });

  it("accepts an unlabelled Supabase ref only under the explicit D8 staging contract", () => {
    const environment = {
      D8_STAGING_CUTOVER_ENABLED: "1",
      D8_STAGING_MIGRATION_ALLOWED: "1",
      D8_STAGING_PROJECT_REF: "abcdefghijklmnopqrst",
      D8_PRODUCTION_PROJECT_REF: "zyxwvutsrqponmlkjihg",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    } as NodeJS.ProcessEnv;
    expect(() => assertSafeSupabaseTestTarget(
      "https://abcdefghijklmnopqrst.supabase.co",
      undefined,
      environment,
    )).not.toThrow();
    expect(() => assertSafeSupabaseTestTarget(
      "https://zyxwvutsrqponmlkjihg.supabase.co",
      undefined,
      environment,
    )).toThrow(/marked/i);
  });
});
