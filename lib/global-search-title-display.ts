import type { GlobalSearchResult } from "@/lib/global-search-types";

function comparableTitle(value: string | undefined): string {
  return value?.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US") ?? "";
}

export function getGlobalSearchTitleDisplay(result: GlobalSearchResult): {
  secondary?: string;
  native?: string;
} {
  if (result.source !== "anilist") {
    return { secondary: result.subtitle };
  }
  const main = comparableTitle(result.title);
  const romaji = comparableTitle(result.subtitle);
  const native = comparableTitle(result.nativeTitle);
  return {
    secondary: romaji && romaji !== main ? result.subtitle : undefined,
    native: native && native !== main && native !== romaji
      ? result.nativeTitle
      : undefined,
  };
}
