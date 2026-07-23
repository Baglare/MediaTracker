"use client";

import { useCallback, useEffect, useState } from "react";
import { summaryToLegacyProgression } from "@/lib/xp/progression";
import type { XpDashboardSummary } from "@/lib/xp/types";
import { parseXpDashboard } from "@/lib/xp/validation";
import type { UserProgression } from "@/lib/user-progression";

const summaryCache = new Map<string, XpDashboardSummary>();
const inFlight = new Map<string, Promise<XpDashboardSummary>>();

export function requestXpSummary(userId: string, force = false): Promise<XpDashboardSummary> {
  const running = inFlight.get(userId);
  if (running) return running;
  const cached = summaryCache.get(userId);
  if (!force && cached) return Promise.resolve(cached);
  const request = fetch("/api/xp", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("xp_summary_unavailable");
      const parsed = parseXpDashboard(await response.json());
      if (!parsed) throw new Error("xp_summary_invalid");
      summaryCache.set(userId, parsed);
      return parsed;
    })
    .finally(() => { inFlight.delete(userId); });
  inFlight.set(userId, request);
  return request;
}

export function useXpProgression(userId: string | null, fallback: UserProgression) {
  const [summary, setSummary] = useState<XpDashboardSummary | null>(() => userId ? summaryCache.get(userId) ?? null : null);
  const [loading, setLoading] = useState(Boolean(userId && !summaryCache.has(userId)));
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!userId) { setSummary(null); setLoading(false); setError(undefined); return; }
    setLoading(true);
    try {
      const next = await requestXpSummary(userId, true);
      setSummary(next); setError(undefined);
    } catch { setError("XP V2 özeti alınamadı; yerel ilerleme gösteriliyor."); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    requestXpSummary(userId)
      .then((next) => { if (active) { setSummary(next); setError(undefined); } })
      .catch(() => { if (active) setError("XP V2 özeti alınamadı; yerel ilerleme gösteriliyor."); })
      .finally(() => { if (active) setLoading(false); });
    const onRefresh = () => { void refresh(); };
    window.addEventListener("focus", onRefresh);
    window.addEventListener("media-tracker:xp-changed", onRefresh);
    return () => { active = false; window.removeEventListener("focus", onRefresh); window.removeEventListener("media-tracker:xp-changed", onRefresh); };
  }, [refresh, userId]);

  const currentSummary = userId ? summary : null;
  return { summary: currentSummary, progression: currentSummary ? summaryToLegacyProgression(currentSummary) : fallback, source: currentSummary ? "xp_v2" as const : "legacy_local" as const, loading: userId ? loading : false, error: userId ? error : undefined, refresh };
}
