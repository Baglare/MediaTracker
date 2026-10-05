import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ops scripts have no runtime caller. Development annotation filesystem
  // tracing must not package privileged privacy tooling into server output.
  outputFileTracingExcludes: { "/*": ["./scripts/privacy-*.mjs"] },
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
