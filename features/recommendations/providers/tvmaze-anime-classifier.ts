import type { TvmazeRawShow } from "@/lib/tvmaze-types";
import type { EvidenceConfidence } from "../domain/types";

export type TvmazeAnimeClassification =
  | "confirmed_anime"
  | "likely_anime"
  | "non_anime"
  | "unknown";

export type TvmazeAnimeReasonCode =
  | "genre_anime"
  | "animation_japanese_language"
  | "animation_jp_network"
  | "animation_jp_web_channel"
  | "western_animation_signals"
  | "non_animation_show_type"
  | "insufficient_metadata";

export interface TvmazeAnimeClassificationResult {
  classification: TvmazeAnimeClassification;
  excludeFromRecommendationTv: boolean;
  confidence: EvidenceConfidence;
  signals: readonly string[];
  reasonCodes: readonly TvmazeAnimeReasonCode[];
}

export interface TvmazeAnimeClassifierInput {
  type?: string | null;
  genres?: readonly string[] | null;
  language?: string | null;
  networkCountryCode?: string | null;
  webChannelCountryCode?: string | null;
}

export interface TvmazeAnimeDebugCounters {
  tvmaze_anime_excluded: number;
  tvmaze_anime_likely_excluded: number;
  tvmaze_anime_unknown: number;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("en-US");
}

export function tvmazeAnimeClassifierInputFromShow(
  show: Pick<TvmazeRawShow, "type" | "genres" | "language" | "network" | "webChannel">,
): TvmazeAnimeClassifierInput {
  return {
    type: show.type,
    genres: show.genres,
    language: show.language,
    networkCountryCode: show.network?.country?.code,
    webChannelCountryCode: show.webChannel?.country?.code,
  };
}

export function classifyTvmazeAnime(
  input: TvmazeAnimeClassifierInput,
): TvmazeAnimeClassificationResult {
  const genres = (input.genres ?? []).map(normalize).filter(Boolean);
  const type = normalize(input.type);
  const language = normalize(input.language);
  const networkCountry = normalize(input.networkCountryCode);
  const webChannelCountry = normalize(input.webChannelCountryCode);

  if (genres.includes("anime")) {
    return {
      classification: "confirmed_anime",
      excludeFromRecommendationTv: true,
      confidence: "high",
      signals: ["genres:Anime"],
      reasonCodes: ["genre_anime"],
    };
  }

  if (type === "animation") {
    const reasonCodes: TvmazeAnimeReasonCode[] = [];
    const signals = ["type:Animation"];
    if (language === "japanese") {
      reasonCodes.push("animation_japanese_language");
      signals.push("language:Japanese");
    }
    if (networkCountry === "jp") {
      reasonCodes.push("animation_jp_network");
      signals.push("network.country:JP");
    }
    if (webChannelCountry === "jp") {
      reasonCodes.push("animation_jp_web_channel");
      signals.push("webChannel.country:JP");
    }
    if (reasonCodes.length > 0) {
      return {
        classification: "likely_anime",
        excludeFromRecommendationTv: true,
        confidence: "medium",
        signals,
        reasonCodes,
      };
    }

    const explicitWesternSignals = language.length > 0
      && language !== "japanese"
      && (networkCountry.length > 0 || webChannelCountry.length > 0)
      && networkCountry !== "jp"
      && webChannelCountry !== "jp";
    if (explicitWesternSignals) {
      return {
        classification: "non_anime",
        excludeFromRecommendationTv: false,
        confidence: "medium",
        signals: [
          "type:Animation",
          `language:${input.language}`,
          ...(input.networkCountryCode ? [`network.country:${input.networkCountryCode}`] : []),
          ...(input.webChannelCountryCode ? [`webChannel.country:${input.webChannelCountryCode}`] : []),
        ],
        reasonCodes: ["western_animation_signals"],
      };
    }

    return {
      classification: "unknown",
      excludeFromRecommendationTv: false,
      confidence: "unknown",
      signals: ["type:Animation"],
      reasonCodes: ["insufficient_metadata"],
    };
  }

  if (type) {
    return {
      classification: "non_anime",
      excludeFromRecommendationTv: false,
      confidence: "medium",
      signals: [`type:${input.type}`],
      reasonCodes: ["non_animation_show_type"],
    };
  }

  return {
    classification: "unknown",
    excludeFromRecommendationTv: false,
    confidence: "unknown",
    signals: [],
    reasonCodes: ["insufficient_metadata"],
  };
}
