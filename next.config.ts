import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	allowedDevOrigins: ["172.26.192.1", "192.168.1.196"],
  // TMDB poster URL'lerinin Next.js Image bileşeniyle kullanılabilmesi için
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "covers.openlibrary.org",
        pathname: "/b/id/**",
      },
      {
        protocol: "https",
        hostname: "s4.anilist.co",
        pathname: "/file/**",
      },
      {
        protocol: "https",
        hostname: "m.media-amazon.com",
        pathname: "/images/**",
      },
      {
        protocol: "https",
        hostname: "ia.media-imdb.com",
        pathname: "/images/**",
      },
    ],
  },
};

export default nextConfig;
