const NONCE_PATTERN = /^[A-Za-z0-9+/]{43}=$/;

// Saved records still use these providers even when new searches are disabled.
const IMAGE_SOURCES = [
  "https://image.tmdb.org", "https://covers.openlibrary.org",
  "https://static.tvmaze.com", "https://s4.anilist.co",
  "https://m.media-amazon.com", "https://ia.media-imdb.com",
];

function supabaseSources(value: string | undefined, development: boolean): string[] {
  if (!value) return [];
  try {
    const url = new URL(value);
    const local = development && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash
      || (!/^[a-z0-9.-]+$/i.test(url.hostname) && !(local && url.hostname === "[::1]"))) return [];
    return [url.origin, `${local ? "ws:" : "wss:"}//${url.host}`];
  } catch {
    return [];
  }
}

export function contentSecurityPolicy({
  nonce,
  development = false,
  supabaseUrl,
}: {
  nonce?: string;
  development?: boolean;
  supabaseUrl?: string;
} = {}): string {
  const sources = supabaseSources(supabaseUrl, development);
  // Missing/malformed nonce never falls back to executable inline scripts.
  const scripts = nonce && NONCE_PATTERN.test(nonce)
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`
    : "'none'";
  return [
    "default-src 'self'",
    `script-src ${scripts}`,
    // React style attributes, theme variables and focal/zoom styles need this.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${IMAGE_SOURCES.join(" ")}${sources[0] ? ` ${sources[0]}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self'${sources.length ? ` ${sources.join(" ")}` : ""}${development ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
