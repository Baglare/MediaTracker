"use client";
import { useId, useState } from "react";
import type { AiEngineStatus, AiSettings } from "@/lib/ai/types";
const MODE_LABEL = {
  structured_only: "Yapılandırılmış kaynak kanıtları",
  local_enhanced: "Yerel semantik doğrulama destekli",
  remote_enhanced: "Uzak semantik doğrulama destekli",
} as const;
const SOURCE_LABEL = { anilist: "AniList", tvmaze: "TVMaze", tmdb: "TMDB", omdb: "OMDb", openlibrary: "Open Library", library: "Kütüphane" } as const;

function planningProviderLabel(provider: AiEngineStatus["planningProvider"]): string {
  if (!provider) return "kullanılmadı";
  if (provider === "openai") return "OpenAI";
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "gemini") return "Gemini";
  if (provider === "groq") return "Groq";
  if (provider === "mock") return "Mock";
  return "Deterministik fallback";
}

export function EngineTransparency({ status, settings, profileEnabled }: { status: AiEngineStatus | null; settings: AiSettings; profileEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!status) return null;
  const mode = status.semanticVerifierMode ?? (status.embeddingMode === "python_service" ? "local_enhanced" : "structured_only");
  return <section className="rounded-xl border border-zinc-800 bg-zinc-950/30"><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="w-full px-3 py-2 text-left text-xs text-zinc-300">Bu öneriler nasıl seçildi?</button>{open && <ul id={id} className="space-y-1 px-4 pb-3 text-[11px] text-zinc-500"><li>Sıralama: Deterministik V2.</li><li>Kimlik ve zorunlu koşullar önce uygulandı.</li><li>LLM final sıralama: kullanılmadı.</li><li>Arama planı: {planningProviderLabel(status.planningProvider)}.</li>{status.providerPolicyMode === "fixed" && <li>Sağlayıcı modu sabit: {planningProviderLabel(status.configuredPlanningProvider)}. OpenAI tercihi uygulanmadı.</li>}{status.providerPolicyMode === "auto" && <li>Sağlayıcı modu otomatik; OpenAI tercihi {status.openAiPreferenceApplied ? "uygulandı" : "kapalı"}.</li>}{status.planningFallbackUsed && <li>Arama planında güvenli fallback kullanıldı.</li>}<li>Kanıt modu: {MODE_LABEL[mode]}.</li><li>Kaynak: {status.sources.map((source) => SOURCE_LABEL[source]).join(", ") || "yapılandırılmış kaynak yok"}.</li><li>Profil: {profileEnabled ? "açık" : "kapalı"}; puan {settings.includeRatings === false ? "kapalı" : "açık"}, favori {settings.includeFavorites === false ? "kapalı" : "açık"}, ilerleme {settings.includeProgress === false ? "kapalı" : "açık"}, not {settings.usePersonalNotes ? "açık" : "kapalı"}.</li></ul>}</section>;
}
