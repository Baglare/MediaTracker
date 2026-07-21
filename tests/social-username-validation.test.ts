import { describe, expect, it } from "vitest";
import {
  canChangeUsername,
  normalizeUsername,
  usernameReservationExpires,
  validateSearchQuery,
  validateSocialProfileInput,
  validateUsername,
} from "@/lib/social/validation";

describe("social username and profile validation", () => {
  it.each(["abc", "baglare", "media_42", "a1_b2"])("accepts valid username %s", (value) => {
    expect(validateUsername(value)).toEqual({ ok: true, value });
  });

  it("normalizes uppercase input to lowercase before validation", () => {
    expect(normalizeUsername("  Baglare_42 ")).toBe("baglare_42");
    expect(validateUsername("Baglare_42")).toEqual({ ok: true, value: "baglare_42" });
  });

  it.each([
    ["bağlare", "Yalnızca"],
    ["_abc", "başlayamaz"],
    ["abc_", "başlayamaz"],
    ["ab__cd", "Ardışık"],
    ["admin", "ayrılmış"],
    ["ab", "3–24"],
    ["a".repeat(25), "3–24"],
  ])("rejects invalid username %s", (value, message) => {
    const result = validateUsername(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("allows initial username immediately and later changes only after 30 days", () => {
    const now = new Date("2026-07-21T00:00:00.000Z");
    expect(canChangeUsername(null, now)).toBe(true);
    expect(canChangeUsername("2026-06-22T00:00:00.000Z", now)).toBe(false);
    expect(canChangeUsername("2026-06-21T00:00:00.000Z", now)).toBe(true);
  });

  it("reserves a released username for 90 days", () => {
    expect(usernameReservationExpires("2026-07-21T00:00:00.000Z").toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("rejects HTML profile text", () => {
    const result = validateSocialProfileInput({
      username: "Baglare",
      displayName: "<b>Bağlare</b>",
      bio: "<script>merhaba</script>",
      location: "İstanbul",
      language: "TR",
      visibilityMode: "protected",
      connectionColor: "custom-hex",
    });
    expect(result).toEqual({ ok: false, error: "Görünen ad 1–60 karakter olmalı." });
  });

  it("falls back an unknown connection color to neutral", () => {
    const result = validateSocialProfileInput({ username: "baglare", displayName: "Bağlare", bio: "Merhaba", visibilityMode: "protected", connectionColor: "custom-hex" });
    expect(result.ok && result.value.connectionColor).toBe("neutral");
  });

  it("validates social search minimum and strips wildcard characters", () => {
    expect(validateSearchQuery("a").ok).toBe(false);
    expect(validateSearchQuery("  ba%g_la,re  ")).toEqual({ ok: true, value: "ba g_la,re" });
  });
});
