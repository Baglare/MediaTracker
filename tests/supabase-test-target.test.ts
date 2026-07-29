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
});
