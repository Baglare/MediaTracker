"use client";

import { useCallback, useEffect, useState } from "react";
import { summaryToLegacyProgression } from "@/lib/xp/progression";
import type { XpDashboardSummary } from "@/lib/xp/types";
import { parseXpDashboard } from "@/lib/xp/validation";
import type { UserProgression } from "@/lib/user-progression";

export function useXpProgression(userId: string | null, fallback: UserProgression) {
  const [summary, setSummary] = useState<XpDashboardSummary | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!userId) { setSummary(null); setLoading(false); setError(undefined); return; }
    try {
      const response = await fetch("/api/xp", { cache: "no-store" });
      if (!response.ok) throw new Error("xp_summary_unavailable");
      const parsed = parseXpDashboard(await response.json());
      if (!parsed) throw new Error("xp_summary_invalid");
      setSummary(parsed); setError(undefined);
    } catch { setError("XP V2 özeti alınamadı; yerel ilerleme gösteriliyor."); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => {
    let active = true;
    fetch("/api/xp", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("xp_summary_unavailable");
        const parsed = parseXpDashboard(await response.json());
        if (!parsed) throw new Error("xp_summary_invalid");
        if (active) { setSummary(parsed); setError(undefined); }
      })
      .catch(() => { if (active) setError("XP V2 özeti alınamadı; yerel ilerleme gösteriliyor."); })
      .finally(() => { if (active) setLoading(false); });
    const onRefresh = () => { void refresh(); };
    window.addEventListener("focus", onRefresh);
    window.addEventListener("media-tracker:xp-changed", onRefresh);
    return () => { active = false; window.removeEventListener("focus", onRefresh); window.removeEventListener("media-tracker:xp-changed", onRefresh); };
  }, [refresh]);

  return { summary, progression: summary ? summaryToLegacyProgression(summary) : fallback, source: summary ? "xp_v2" as const : "legacy_local" as const, loading, error, refresh };
}
