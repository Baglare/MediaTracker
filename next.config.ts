import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    ],
  },
};

export default nextConfig;
