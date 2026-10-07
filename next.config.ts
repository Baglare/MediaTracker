import type { NextConfig } from "next";
import { resolveBackendProvider } from "./lib/backend/provider";
const backendProvider = resolveBackendProvider(process.env.BACKEND_PROVIDER, process.env.NODE_ENV === "production");

const nextConfig: NextConfig = {
  output: 'standalone',
  cacheMaxMemorySize: backendProvider === 'native' ? 16 * 1024 * 1024 : undefined,
  // Installed Next 16.3.8 optimizer supports these resource controls. Keep
  // fallback defaults; native hosting must not decode the default 268M pixels.
  experimental: backendProvider === 'native' ? { imgOptConcurrency: 1, imgOptOperationCache: false,
    imgOptMaxInputPixels: 16_777_216, imgOptSequentialRead: true, imgOptTimeoutInSeconds: 5 } : {},
  // Only the selector is public; DB/auth secrets never enter the client bundle.
  env: { NEXT_PUBLIC_BACKEND_PROVIDER: backendProvider },
  // Ops scripts have no runtime caller. Development annotation filesystem
  // tracing must not package privileged privacy tooling into server output.
  outputFileTracingExcludes: { "/*": ["./scripts/**", "./scripts/ops/**", "./tests/**", "./.codex/**", "./.git/**", "./.env*", "./backups/**"] },
	allowedDevOrigins: ["172.26.192.1", "192.168.1.196"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
  // TMDB poster URL'lerinin Next.js Image bileşeniyle kullanılabilmesi için
  images: {
    maximumResponseBody: backendProvider === 'native' ? 10 * 1024 * 1024 : 50_000_000,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        port: "",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "covers.openlibrary.org",
        port: "",
        pathname: "/b/id/**",
      },
      {
        protocol: "https",
        hostname: "s4.anilist.co",
        port: "",
        pathname: "/file/**",
      },
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
        port: "",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "ia.media-imdb.com",
        port: "",
        pathname: "/images/**",
      },
    ],
  },
};

export default nextConfig;
