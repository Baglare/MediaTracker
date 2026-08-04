import { describe, expect, it } from "vitest";
import {
  classifyTvmazeAnime,
  tvmazeAnimeClassifierInputFromShow,
} from "@/features/recommendations/providers/tvmaze-anime-classifier";

describe("TVMaze recommendation-only anime classifier contract", () => {
  it("Anime genre değerini confirmed anime sayar", () => {
    expect(classifyTvmazeAnime({ genres: ["Drama", " anime "] })).toEqual({
      classification: "confirmed_anime",
      excludeFromRecommendationTv: true,
      confidence: "high",
      signals: ["genres:Anime"],
      reasonCodes: ["genre_anime"],
    });
  });

  it("Animation + Japanese değerini likely anime sayar", () => {
    expect(classifyTvmazeAnime({ type: "Animation", language: "Japanese" })).toMatchObject({
      classification: "likely_anime",
      excludeFromRecommendationTv: true,
      reasonCodes: ["animation_japanese_language"],
    });
  });

  it.each([
    [{ type: "Animation", networkCountryCode: "JP" }, "animation_jp_network"],
    [{ type: "Animation", webChannelCountryCode: "jp" }, "animation_jp_web_channel"],
  ] as const)("JP yayın sinyalini likely anime sayar", (input, reasonCode) => {
    expect(classifyTvmazeAnime(input)).toMatchObject({
      classification: "likely_anime",
      excludeFromRecommendationTv: true,
      reasonCodes: [reasonCode],
    });
  });

  it("Animation + English + US kaydını Batı animasyonu olarak korur", () => {
    expect(classifyTvmazeAnime({
      type: "Animation",
      language: "English",
      networkCountryCode: "US",
    })).toMatchObject({
      classification: "non_anime",
      excludeFromRecommendationTv: false,
      reasonCodes: ["western_animation_signals"],
    });
  });

  it("yalnız Animation değerini otomatik anime saymaz", () => {
    expect(classifyTvmazeAnime({ type: "Animation" })).toMatchObject({
      classification: "unknown",
      excludeFromRecommendationTv: false,
    });
  });

  it("non-animation show type değerini anime saymaz", () => {
    expect(classifyTvmazeAnime({ type: "Scripted", language: "Japanese" })).toMatchObject({
      classification: "non_anime",
      excludeFromRecommendationTv: false,
      reasonCodes: ["non_animation_show_type"],
    });
  });

  it("metadata eksikse unknown üretir ve sırf belirsizlikten elemez", () => {
    expect(classifyTvmazeAnime({})).toEqual({
      classification: "unknown",
      excludeFromRecommendationTv: false,
      confidence: "unknown",
      signals: [],
      reasonCodes: ["insufficient_metadata"],
    });
  });

  it("raw show alanlarını side effect olmadan classifier input'una taşır", () => {
    const show = {
      id: 1,
      name: "Fixture",
      type: "Animation",
      genres: ["Drama"],
      language: "Japanese",
      network: { id: 2, name: "Network", country: { name: "Japan", code: "JP" } },
      webChannel: null,
    };
    const before = JSON.stringify(show);
    const input = tvmazeAnimeClassifierInputFromShow(show);
    expect(input).toEqual({
      type: "Animation",
      genres: ["Drama"],
      language: "Japanese",
      networkCountryCode: "JP",
      webChannelCountryCode: undefined,
    });
    expect(JSON.stringify(show)).toBe(before);
    expect(classifyTvmazeAnime(input)).toEqual(classifyTvmazeAnime(input));
  });
});
