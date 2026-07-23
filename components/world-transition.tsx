// ============================================
// R13 / R13.2 — World Macro Transition
// ============================================
// R13.2 ÖNEMLİ DAVRANIŞ DEĞİŞİKLİĞİ:
// Önceki versiyon (R13/R13.1) `world` prop'unu izliyor, değişimde otomatik
// tetikliyordu. Bu, ayarlar sekmesine girip çıkıldığında veya başka non-user
// kaynaklı `worldAttr` değişimlerinde yanlış pozitif tetiklemelere yol açtı
// (worldAttr `activeTab === "settings" ? "neutral" : ...` şeklinde
// hesaplandığı için sekme geçişleri animasyonu tetikliyordu).
//
// Yeni model: parent (app/page.tsx) yalnızca kullanıcı gerçekten Dünya
// filtresini değiştirdiğinde `trigger` prop'unu yeni bir token ile bumplar.
// Bu component sadece token değişimini izler; world değişimini değil. Bu
// sayede sekme/medya ekleme/state hidrasyonu gibi olaylar hiçbir zaman
// transition tetikleyemez.

"use client";

import { useEffect, useRef, useState } from "react";
import type { EffectsLevel } from "@/lib/personalization/types";

export type WorldKey = "east" | "screen" | "arch" | "neutral";

export interface WorldTransitionTrigger {
  // Monotonik counter — parent functional updater ile bumplar.
  token: number;
  // Hangi dünya animasyonunu oynatacağız.
  world: WorldKey;
}

interface WorldTransitionProps {
  // null → henüz hiç tetikleme olmamış. Component oynamaz.
  trigger: WorldTransitionTrigger | null;
  effectsLevel: EffectsLevel;
}

// Süreler 700–1400ms aralığında. Loop yok.
const PLAY_MS: Record<Exclude<WorldKey, "neutral">, number> = {
  east: 1150,    // slash 1000 + tint 1100 (overlap)
  screen: 1250,  // aperture 1200 + beam 1100
  arch: 1000,   // seal 900 + ink 1000
};

interface PlayState {
  token: number;
  world: Exclude<WorldKey, "neutral">;
  effectsLevel: Exclude<EffectsLevel, "off">;
}

export default function WorldTransition({ trigger, effectsLevel }: WorldTransitionProps) {
  // Son işlenen token'ı tutuyoruz; aynı token tekrar gelirse no-op.
  const lastTokenRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const [play, setPlay] = useState<PlayState | null>(null);

  // prefers-reduced-motion takibi.
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

  // Tetik izleme: sadece token değişiminde reaksiyon. world prop'unu
  // KASITLI olarak izlemiyoruz (R13.2 dersi).
  useEffect(() => {
    if (!trigger) return;
    if (lastTokenRef.current === trigger.token) return;
    lastTokenRef.current = trigger.token;

    // Neutral'a geçişte oynatmıyoruz (Tümü/Settings için sade kalsın — brief).
    if (trigger.world === "neutral") return;
    if (effectsLevel === "off") return;
    if (reducedMotionRef.current) return;

    setPlay({ token: trigger.token, world: trigger.world, effectsLevel });
  }, [effectsLevel, trigger]);

  // Animasyon süresi dolunca DOM'dan kaldır.
  useEffect(() => {
    if (!play) return;
    const ms = PLAY_MS[play.world];
    const t = window.setTimeout(() => setPlay(null), ms + 50);
    return () => window.clearTimeout(t);
  }, [play]);

  if (!play || effectsLevel === "off") return null;

  return (
    // z-[45]: app-topbar (z-40) üstünde — macro burst ekran ortasından net
    // görünsün; modallar (z-50) hâlâ üstte. pointer-events-none → tıklama
    // bloke yok. fixed inset-0 → layout shift yok.
    <div
      key={play.token}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[45] overflow-hidden"
    >
      <Overlay world={play.world} effectsLevel={play.effectsLevel} />
    </div>
  );
}

function Overlay({
  world,
  effectsLevel,
}: {
  world: Exclude<WorldKey, "neutral">;
  effectsLevel: Exclude<EffectsLevel, "off">;
}) {
  const full = effectsLevel === "full";
  switch (world) {
    case "east":
      return (
        <>
          <div className="r13-east-tint" />
          {full && <div className="r13-east-slash" />}
        </>
      );
    case "screen":
      return (
        <>
          <div className="r13-screen-beam" />
          {full && <div className="r13-screen-aperture" />}
        </>
      );
    case "arch":
      return (
        <>
          <div className="r13-arch-ink" />
          {full && <div className="r13-arch-seal" />}
        </>
      );
  }
}
