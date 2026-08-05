"use client";

import Image from "next/image";
import { Sparkles } from "lucide-react";

export function RecommendationCardHeader({
  title,
  coverUrl,
  mediaType,
  source,
  releaseYear,
  badge,
  resultKind = "primary",
}: {
  title: string;
  coverUrl?: string;
  mediaType: string;
  source: string;
  releaseYear?: number;
  badge: string;
  resultKind?: "primary" | "near_match";
}) {
  const badgeClass = resultKind === "near_match"
    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
    : "border-violet-500/30 bg-violet-500/15 text-violet-300";
  return <div className="flex min-w-0 gap-3">
    {coverUrl ? (
      <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-zinc-800">
        <Image src={coverUrl} alt="" fill sizes="56px" className="object-cover" unoptimized />
      </div>
    ) : (
      <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-md bg-zinc-800/60 text-zinc-600" aria-hidden="true">
        <Sparkles className="h-5 w-5" />
      </div>
    )}
    <div className="min-w-0 flex-1">
      <h4 className="line-clamp-2 break-normal text-sm font-semibold text-zinc-100 [overflow-wrap:break-word] group-hover:line-clamp-none group-focus-within:line-clamp-none">
        {title}
      </h4>
      <p className="truncate text-[11px] text-zinc-500">
        {mediaType}<span className="mx-1 text-zinc-700">·</span>{source}
        {releaseYear ? <><span className="mx-1 text-zinc-700">·</span>{releaseYear}</> : null}
      </p>
      <span className={`mt-1 inline-flex max-w-full rounded-md border px-2 py-0.5 text-left text-[10px] font-medium leading-tight break-normal [overflow-wrap:break-word] ${badgeClass}`}>
        {badge}
      </span>
    </div>
  </div>;
}
