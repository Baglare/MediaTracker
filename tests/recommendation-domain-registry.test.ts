import { describe, expect, it } from "vitest";
import {
  ASPECT_GROUPS,
  ASPECT_IDS,
  ASPECT_REGISTRY,
  ASPECT_STRENGTH_THRESHOLDS,
  PRIMARY_RECOMMENDATION_PROVIDERS,
  RECOMMENDATION_PROVIDERS,
  createVerifiedRecommendationIdentity,
  findAspectByAlias,
  providerSupports,
  strengthToLevel,
  validateAspectRegistry,
  validateStrengthLevelPair,
} from "@/features/recommendations/domain";

describe("Recommendation V2 aspect registry", () => {
  it("43 benzersiz aspect ve beş group içerir", () => {
    expect(ASPECT_IDS).toHaveLength(43);
    expect(new Set(ASPECT_IDS).size).toBe(43);
    expect(new Set(ASPECT_IDS.map((id) => ASPECT_REGISTRY[id].group))).toEqual(new Set(ASPECT_GROUPS));
  });

  it("registry runtime invariant'larını karşılar", () => {
    expect(validateAspectRegistry()).toEqual({ ok: true, value: ASPECT_REGISTRY });
  });

  it("her kayıtta iki label, alias, MediaType ve beş explicit provider mapping'i vardır", () => {
    for (const id of ASPECT_IDS) {
      const entry = ASPECT_REGISTRY[id];
      expect(entry.labelTr.trim()).not.toBe("");
      expect(entry.labelEn.trim()).not.toBe("");
      expect(entry.aliasesTr.length).toBeGreaterThan(0);
      expect(entry.aliasesEn.length).toBeGreaterThan(0);
      expect(entry.supportedMediaTypes.length).toBeGreaterThan(0);
      expect(Object.keys(entry.providerSupport).sort()).toEqual([...RECOMMENDATION_PROVIDERS].sort());
      expect(["safe", "conditional", "unsafe"]).toContain(entry.mustSafety);
      expect(["safe", "conditional", "unsafe"]).toContain(entry.avoidSafety);
      expect(["not_required", "recommended", "required_for_hard_decision"]).toContain(entry.semanticVerifier);
    }
  });

  it("Türkçe ve İngilizce alias'ları deterministik normalize eder", () => {
    expect(findAspectByAlias("  AŞK  ", "tr")).toBe("romance");
    expect(findAspectByAlias("Science-Fiction", "en")).toBe("sci_fi");
    expect(findAspectByAlias("bilinmeyen aspect", "tr")).toBeNull();
  });
});

describe("Recommendation V2 provider ownership", () => {
  it("primary ownership matrisini sabitler", () => {
    expect(PRIMARY_RECOMMENDATION_PROVIDERS.anime).toEqual(["anilist"]);
    expect(PRIMARY_RECOMMENDATION_PROVIDERS.tv).toEqual(["tvmaze", "tmdb"]);
    expect(PRIMARY_RECOMMENDATION_PROVIDERS.movie).toEqual(["tmdb"]);
    expect(PRIMARY_RECOMMENDATION_PROVIDERS.book).toEqual(["openlibrary"]);
  });

  it("provider/media capability uyumsuzluğunu reddedebilir", () => {
    expect(providerSupports("tvmaze", "discovery", "tv")).toBe(true);
    expect(providerSupports("tvmaze", "discovery", "anime")).toBe(false);
    expect(providerSupports("omdb", "secondary_verification", "movie")).toBe(true);
    expect(providerSupports("omdb", "discovery", "movie")).toBe(false);
  });

  it("doğrulanmamış veya unsupported identity oluşturmaz", () => {
    expect(createVerifiedRecommendationIdentity({
      provider: "tmdb", externalId: "42", mediaType: "movie", providerIdentityVerified: false,
    }).ok).toBe(false);
    expect(createVerifiedRecommendationIdentity({
      provider: "tvmaze", externalId: "1", mediaType: "anime", providerIdentityVerified: true,
    }).ok).toBe(false);
    expect(createVerifiedRecommendationIdentity({
      provider: "anilist", externalId: "1", mediaType: "anime", providerIdentityVerified: true,
    })).toMatchObject({ ok: true, value: { verificationStatus: "verified" } });
  });
});

describe("Recommendation V2 aspect strength", () => {
  it("merkezi başlangıç eşiklerini sabitler", () => {
    expect(ASPECT_STRENGTH_THRESHOLDS).toEqual({ primary: 0.75, significant: 0.5, incidental: 0.2, absent: 0 });
  });

  it.each([
    [1, "primary"],
    [0.75, "primary"],
    [0.749999, "significant"],
    [0.5, "significant"],
    [0.499999, "incidental"],
    [0.2, "incidental"],
    [0.199999, "absent"],
    [0, "absent"],
    [null, "unknown"],
  ] as const)("strength %s -> %s", (strength, level) => {
    expect(strengthToLevel(strength)).toBe(level);
  });

  it.each([-1, 1.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "geçersiz strength %s değerini reddeder",
    (strength) => expect(() => strengthToLevel(strength)).toThrowError(),
  );

  it("payload level mismatch'ini sessizce bırakmaz", () => {
    expect(validateStrengthLevelPair(0.8, "significant")).toMatchObject({
      ok: false,
      issues: [{ code: "aspect_level_mismatch" }],
    });
  });
});
