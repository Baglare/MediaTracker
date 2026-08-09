"use client";

import { useId, useState } from "react";
import { ChevronRight, ExternalLink, ShieldCheck } from "lucide-react";
import type { PublicResearchEvidenceSummary } from "@/lib/ai/types";

const LEVEL_TEXT = { incidental: "ikincil düzeyde", significant: "belirgin düzeyde", primary: "ana unsur olarak" } as const;
const CONFIDENCE_TEXT = { low: "Sınırlı güven", medium: "Orta güven" } as const;

export function researchAspectSentence(aspect: PublicResearchEvidenceSummary["affectedAspects"][number]): string {
  if (aspect.finding === "explicit_absence") return "Kaçınılan unsurun bulunmadığına dair açık kaynak kanıtı bulundu.";
  return `${aspect.label}: ${aspect.level ? LEVEL_TEXT[aspect.level] : ""} desteklendi.`;
}

export function ResearchEvidenceDisclosure({ evidence }: { evidence?: PublicResearchEvidenceSummary }) {
  const [expanded, setExpanded] = useState(false);
  const generatedId = useId();
  const panelId = `research-evidence-${generatedId.replace(/:/g, "")}`;
  if (!evidence) return null;
  return (
    <div className="mt-3 min-w-0 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
          <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="break-words">Araştırmayla doğrulandı</span>
        </span>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-emerald-200 outline-none hover:bg-emerald-500/10 focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
          <span className="break-words text-left">Kaynaklı doğrulama</span>
        </button>
      </div>
      <div id={panelId} hidden={!expanded} className="mt-2 min-w-0 space-y-2 border-t border-emerald-500/15 pt-2">
        <ul className="space-y-1">
          {evidence.affectedAspects.map((aspect) => (
            <li key={`${aspect.aspectId}:${aspect.finding}`} className="min-w-0 text-xs leading-relaxed text-zinc-300">
              <span className="break-words">{researchAspectSentence(aspect)}</span>{" "}
              <span className="whitespace-nowrap text-zinc-500">{CONFIDENCE_TEXT[aspect.confidence]}</span>
            </li>
          ))}
        </ul>
        <ul className="space-y-1">
          {evidence.sources.map((source) => (
            <li key={source.url} className="min-w-0 text-xs">
              <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${source.label} kaynağını yeni sekmede aç`} className="inline-flex max-w-full items-center gap-1 rounded text-emerald-300 underline decoration-emerald-500/40 underline-offset-2 outline-none hover:text-emerald-200 focus-visible:ring-2 focus-visible:ring-emerald-400/70">
                <span className="truncate">{source.label}</span><ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
              {source.attribution && <p className="mt-0.5 break-words text-[10px] leading-relaxed text-zinc-500">{source.attribution}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
