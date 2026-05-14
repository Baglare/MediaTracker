// ============================================
// R40.1 — Target type family expansion
// ============================================
// Kullanıcının istediği "tür ailesi"ni intent.targetTypes + mesaj metnine göre
// genişletir. intent-analyzer "manga öner" → ["manga"] döner ama gerçek niyet
// manhwa/manhua'yı da kapsar; aynı şekilde "novel" hiç MediaType token'ı yok.
// Bu helper, tüm aday yollarında (source-api, library-source, client fallback,
// localCandidates) tutarlı bir aile filtresi uygulanması için tek nokta.

import { MediaType } from "@/lib/types";

const MANGA_FAMILY: MediaType[] = ["manga", "manhwa", "manhua"];
const NOVEL_FAMILY: MediaType[] = ["light_novel", "web_novel", "visual_novel"];

// "novel öner" → light_novel/web_novel/visual_novel.
// "kitap" → book olarak ayrıca eşleşir (intent-analyzer'ın TYPE_TOKENS'ı).
const NOVEL_RE = /\bnovel\b|light\s*novel|web\s*novel|visual\s*novel/i;

/**
 * intent.targetTypes ve user message'tan filtre için kullanılacak MediaType
 * ailesini üretir. Hiç hedef yoksa boş Set döner (filtre uygulanmaz).
 */
export function expandTargetFamily(
  targets: MediaType[],
  message: string = ""
): Set<MediaType> {
  const out = new Set<MediaType>();
  let expandManga = false;
  let expandNovel = false;

  for (const t of targets) {
    out.add(t);
    if (MANGA_FAMILY.includes(t)) expandManga = true;
    if (NOVEL_FAMILY.includes(t)) expandNovel = true;
  }

  if (NOVEL_RE.test(message)) expandNovel = true;

  if (expandManga) for (const x of MANGA_FAMILY) out.add(x);
  if (expandNovel) for (const x of NOVEL_FAMILY) out.add(x);

  return out;
}

/** Debug satırı için kompakt etiket: "anime" / "manga|manhwa|manhua" vb. */
export function familyLabel(targets: MediaType[], message: string = ""): string {
  if (targets.length === 0) return "-";
  const fam = expandTargetFamily(targets, message);
  return Array.from(fam).join("|");
}
