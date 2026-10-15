import Image from "next/image";

export function TmdbAttribution() {
  return (
    <div className="space-y-2">
      <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" aria-label="The Movie Database (TMDB)">
        <Image src="/attribution/tmdb.svg" alt="TMDB" width={64} height={28} unoptimized className="h-auto w-16 rounded bg-white p-1" />
      </a>
      <p lang="en">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      <p>Yeni TMDB aramaları şu anda kapalıdır.</p>
      <a href="https://www.themoviedb.org/api-terms-of-use" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">TMDB API kullanım koşulları</a>
    </div>
  );
}
