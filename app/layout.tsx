import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediaTracker - Medya Takip Uygulaması",
  description:
    "Film, dizi, anime, manga, manhwa ve kitaplarını tek yerden takip et.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
