"use client";
import { useId, useState } from "react";
import type { AiRecommendation } from "@/lib/ai/types";

export function EvidenceSummary({ items = [] }: { items?: AiRecommendation["evidenceSummary"] }) { const [open, setOpen] = useState(false); const id = useId(); if (!items.length) return null; return <div className="mt-2"><button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="text-[11px] text-violet-300">Kanıt özeti</button>{open && <div id={id} className="mt-1 flex flex-wrap gap-1">{items.map((item) => <span key={`${item.label}:${item.value}`} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300">{item.label}: {item.value}{item.confidenceLabel ? ` · ${item.confidenceLabel}` : ""}</span>)}</div>}</div>; }
