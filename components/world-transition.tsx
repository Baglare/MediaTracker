// ============================================
// R13 — World Macro Transition
// ============================================
// Aktif dünya değiştiğinde tek seferlik macro animasyonu mount eder.
// JS tetikleme + CSS'te tanımlı keyframes (globals.css R13 bloğu) eşliği.
//
// Davranış kuralları (R13 brief):
//   - Sadece WORLD değiştiğinde oynar. Search/status/type/sort gibi diğer
//     filtrelerle hiç ilgilenmez (parent yalnız `world` prop'unu geçer).
//   - İlk mount'ta oynamaz (uygulama açılışında ekrana animasyon fırlatmak
//     yanıltıcı olur).
//   - newWorld === "neutral" iken oynamaz (Tümü/Settings'e dönüşte sade).
//     Brief'in "ilk tercih: neutral geçişte hiç animasyon yok" kararı.
//   - prefers-reduced-motion: reduce → JS skip + CSS no-op (defense in depth).
//   - Animasyon biter bitmez DOM'dan kalkar; pointer-events-none olduğu için
//     oynarken bile etkileşimi bloke etmez.
//   - z-index 30: app-topbar (z-40) ve modallar (z-50) üstte kalsın.
//
// Kasıtlı yapılmayanlar:
//   - localStorage / context / no-flash boot — yok.
//   - Asset (görsel/canvas/svg yığını) — yok; her şey transform/opacity.
//   - Ambient/loop animasyon — yok; her tetikleme tek atış.

"use client";

import { useEffect, useRef, useState } from "react";

export type WorldKey = "east" | "screen" | "arch" | "neutral";

interface WorldTransitionProps {
  world: WorldKey;
}

// Mount edilen overlay'in yaşam süresi. CSS'teki en uzun animasyona +50ms
// güvenlik tamponu — animasyon-end event yerine timeout kullanıyoruz çünkü
// birden fazla katmandaki animationend'leri saymak gereksiz karmaşa.
const PLAY_MS: Record<WorldKey, number> = {
  east: 1150,    // slash 950 + tint 1100
  screen: 1250,  // aperture 1200 + beam 1100
  arch: 1000,   // seal 900 + ink 950
  neutral: 0,   // hiç oynatmıyoruz
};

interface PlayState {
  // Her tetiklemede artar; React re-mount için key.
  token: number;
  world: WorldKey;
}

export default function WorldTransition({ world }: WorldTransitionProps) {
  // Bir önceki değeri ref'te tutuyoruz — render-phase update'i tetiklemiyor;
  // useEffect değişimi yakalayınca play state'i kuruyor.
  const prevWorldRef = useRef<WorldKey | null>(null);
  const reducedMotionRef = useRef(false);
  // R13.1: Date.now() yerine monotonik counter — aynı ms içinde art arda
  // tetiklenirse de key benzersiz kalır, React garanti remount eder.
  const tokenCounterRef = useRef(0);
  const [play, setPlay] = useState<PlayState | null>(null);

  // prefers-reduced-motion takibi. Mount sonrası ve değişimde güncel kalır.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Dünya prop'u değiştiğinde tetikleme.
  useEffect(() => {
    const prev = prevWorldRef.current;
    prevWorldRef.current = world;

    // İlk mount: sadece referansı set edip çık.
    if (prev === null) return;
    // Aynı dünya: no-op (parent zaten search/status/sort değişimini bizden
    // saklıyor; gelse bile burada eler).
    if (prev === world) return;
    // Neutral'a geçişte animasyon yok (brief: sade fade veya hiç — hiçi seçtik).
    if (world === "neutral") return;
    // Reduced motion: skip.
    if (reducedMotionRef.current) return;

    tokenCounterRef.current += 1;
    setPlay({ token: tokenCounterRef.current, world });
  }, [world]);

  // Animasyon süresi dolunca DOM'dan kaldır.
  useEffect(() => {
    if (!play) return;
    const ms = PLAY_MS[play.world];
    if (ms <= 0) {
      setPlay(null);
      return;
    }
    const t = window.setTimeout(() => setPlay(null), ms + 50);
    return () => window.clearTimeout(t);
  }, [play]);

  if (!play) return null;
  // Tip daraltması: useEffect zaten neutral'ı eliyor ama TS'in görmesi için
  // burada tekrar kontrol edip Overlay'in dar tipine düşürüyoruz.
  if (play.world === "neutral") return null;
  const playingWorld: Exclude<WorldKey, "neutral"> = play.world;

  return (
    // R13.1: z-30 → z-[45] yükseltildi. Topbar (z-40) artık 1s'lik macro
    // burst sırasında görsel olarak overlay'in altında kalır — kasıtlı, çünkü
    // animasyon ekran ortasından geçen bir slash/aperture/seal hissi vermek
    // zorunda. pointer-events-none olduğu için topbar tıklamaları bloke
    // edilmez. Modallar (z-50) hâlâ üstte → modal açıkken transition'ı örter.
    // key={token}: monotonik counter (R13.1) garantili remount sağlar.
    <div
      key={play.token}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[45] overflow-hidden"
    >
      <Overlay world={playingWorld} />
    </div>
  );
}

function Overlay({ world }: { world: Exclude<WorldKey, "neutral"> }) {
  // Her dünya için 2 ince katman — biri "alan tinti" (radial), biri "olay"
  // (slash / aperture / seal). Karışık dilden kaçınıyoruz.
  switch (world) {
    case "east":
      return (
        <>
          <div className="r13-east-tint" />
          <div className="r13-east-slash" />
        </>
      );
    case "screen":
      return (
        <>
          <div className="r13-screen-aperture" />
          <div className="r13-screen-beam" />
        </>
      );
    case "arch":
      return (
        <>
          <div className="r13-arch-ink" />
          <div className="r13-arch-seal" />
        </>
      );
  }
}
