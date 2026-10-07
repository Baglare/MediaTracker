import type { NextConfig } from "next";
import { resolveBackendProvider } from "./lib/backend/provider";

const nextConfig: NextConfig = {
  // Only the selector is public; DB/auth secrets never enter the client bundle.
  env: { NEXT_PUBLIC_BACKEND_PROVIDER: resolveBackendProvider(process.env.BACKEND_PROVIDER, process.env.NODE_ENV === "production") },
  // Ops scripts have no runtime caller. Development annotation filesystem
  // tracing must not package privileged privacy tooling into server output.
  outputFileTracingExcludes: { "/*": ["./scripts/privacy-*.mjs", "./scripts/ops/**"] },
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
