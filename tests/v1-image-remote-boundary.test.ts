import { describe, expect, it } from "vitest";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import config from "../next.config";

const accepts = (url: string) => hasRemoteMatch([], config.images?.remotePatterns ?? [], new URL(url));

describe("v1 image optimizer remote boundary", () => {
  it.each([
    "https://image.tmdb.org/t/p/w500/poster.jpg",
    "https://covers.openlibrary.org/b/id/123-M.jpg?default=false",
    "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/poster.jpg",
    "https://m.media-amazon.com/images/M/poster.jpg",
    "https://ia.media-imdb.com/images/M/poster.jpg",
  ])("preserves provider and stored legacy cover paths: %s", (url) => {
    expect(accepts(url)).toBe(true);
  });

  it.each([
    "http://image.tmdb.org/t/p/w500/poster.jpg",
    "https://image.tmdb.org:8443/t/p/w500/poster.jpg",
    "https://image.tmdb.org.attacker.example/t/p/w500/poster.jpg",
    "https://image.tmdb.org/private/poster.jpg",
    "https://covers.openlibrary.org/private/poster.jpg",
    "https://s4.anilist.co/private/poster.jpg",
    "https://m.media-amazon.com/private/poster.jpg",
    "https://ia.media-imdb.com/private/poster.jpg",
    "https://127.0.0.1/images/poster.jpg",
  ])("rejects URLs outside the configured boundary: %s", (url) => {
    expect(accepts(url)).toBe(false);
  });
});
