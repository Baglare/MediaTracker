// ============================================
// POST /api/ai/recommend
// ============================================
// 1) Intent analiz, 2) Library profile, 3) Aday arama (AniList/TVmaze/OpenLibrary
//    veya local kütüphane), 4) Provider'a sıralat. Provider hata verirse mock fallback.

import { NextRequest, NextResponse } from "next/server";
import { getProvider, mockProvider } from "@/lib/ai/provider";
import { buildLibraryProfile } from "@/lib/ai/profile-builder";
import { analyzeIntent } from "@/lib/ai/intent-analyzer";
import { searchCandidates } from "@/lib/ai/candidate-search";
import { AiRecommendRequest, AiRecommendResponse, AiSettings } from "@/lib/ai/types";

export const runtime = "nodejs";

function buildTransparencySummary(s: AiSettings): string {
  const parts = [
    s.useProfile ? "kütüphane profil özeti" : null,
    s.useRecentActivity ? "son aktivite özeti" : null,
    `web araştırması ${s.useWebResearch ? "açık" : "kapalı"}`,
    `kişisel notlar ${s.usePersonalNotes ? "dahil" : "değil"}`,
    s.deepResearch ? "derin araştırma modu" : null,
  ].filter(Boolean);
  return `Bu istekte kullanılacaklar: ${parts.join(", ")}.`;
}

export async function POST(req: NextRequest) {
  let body: AiRecommendRequest;
  try {
    body = (await req.json()) as AiRecommendRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = (body.message || "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const settings = body.settings;
  const mediaItems = Array.isArray(body.mediaItems) ? body.mediaItems : [];
  const progressLogs = Array.isArray(body.progressLogs) ? body.progressLogs : [];
  const intent = analyzeIntent(message);
  const profile = settings?.useProfile
    ? buildLibraryProfile(mediaItems, progressLogs, settings)
    : null;

  // Aday havuzu
  let candidates = await searchCandidates({ intent, profile, message, mediaItems, progressLogs });

  // inLibrary işaretle (dış kaynak adayları için)
  const libIndex = new Map<string, true>();
  for (const m of mediaItems) {
    if (m.externalSource && m.externalId) {
      libIndex.set(`${m.externalSource}:${m.externalId}`, true);
    }
  }
  candidates = candidates.map((c) => {
    if (c.source !== "library" && libIndex.has(`${c.source}:${c.externalId}`)) {
      return { ...c };
    }
    return c;
  });

  // Pool tamamen boşsa kullanıcıya net bir mesaj dön — provider'a gitmeye gerek yok.
  if (candidates.length === 0) {
    const empty: AiRecommendResponse = {
      assistantMessage:
        "Bu istek için doğrulanmış aday bulamadım. Daha net bir tür (örn. anime / dizi / kitap) ya da belirgin bir mood (örn. romantik, chill) eklersen daha iyi öneri verebilirim.",
      recommendations: [],
      transparencySummary: buildTransparencySummary(settings),
      intent,
      debug: { provider: "none", note: "empty candidate pool" },
    };
    return NextResponse.json(empty);
  }

  const provider = getProvider();

  try {
    const response = await provider.generate({
      message,
      profile,
      intent,
      settings,
      candidates,
      recentContext: body.recentContext,
    });
    // inLibrary'i son kez kesinleştir
    response.recommendations = response.recommendations.map((r) => ({
      ...r,
      inLibrary:
        r.inLibrary ||
        (!!r.externalSource && !!r.externalId && libIndex.has(`${r.externalSource}:${r.externalId}`)),
    }));
    return NextResponse.json(response satisfies AiRecommendResponse);
  } catch (err) {
    const fallback = await mockProvider.generate({
      message,
      profile,
      intent,
      settings,
      candidates,
    });
    fallback.debug = {
      provider: provider.name,
      fellBackToMock: true,
      note: err instanceof Error ? err.message : "unknown error",
    };
    fallback.recommendations = fallback.recommendations.map((r) => ({
      ...r,
      inLibrary:
        r.inLibrary ||
        (!!r.externalSource && !!r.externalId && libIndex.has(`${r.externalSource}:${r.externalId}`)),
    }));
    return NextResponse.json(fallback);
  }
}
