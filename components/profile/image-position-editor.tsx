"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Minus, Plus, RotateCcw } from "lucide-react";
import { useRef } from "react";

import {
  DEFAULT_IMAGE_TRANSFORM,
  IMAGE_TRANSFORM_LIMITS,
  normalizeImageTransform,
  nudgeImageTransform,
  resolveImageTransformStyle,
  type ImageTransform,
  type ImageTransformKind,
} from "@/lib/personalization/image-transform";

interface ImagePositionEditorProps {
  kind: ImageTransformKind;
  src: string;
  value: ImageTransform;
  onChange: (value: ImageTransform) => void;
  disabled?: boolean;
}

const STEP = 2;

export function ImagePositionEditor({ kind, src, value, onChange, disabled = false }: ImagePositionEditorProps) {
  const dragStart = useRef<{ x: number; y: number; value: ImageTransform } | undefined>(undefined);
  const normalized = normalizeImageTransform(value);
  const style = resolveImageTransformStyle(normalized, kind);
  const label = kind === "banner" ? "Banner konumlandırma önizlemesi" : "Profil fotoğrafı konumlandırma önizlemesi";

  function updateZoom(zoom: number) {
    onChange(normalizeImageTransform({ ...normalized, zoom }));
  }

  function nudge(x: number, y: number) {
    onChange(nudgeImageTransform(normalized, x, y));
  }

  return (
    <div className="space-y-3" data-image-position-editor={kind}>
      <div
        role="application"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        className={`relative overflow-hidden border border-[var(--app-border-strong)] bg-[var(--app-surface-3)] shadow-inner focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${kind === "banner" ? "aspect-[3/1] rounded-xl" : "mx-auto aspect-square w-40 rounded-full"}`}
        style={{ touchAction: "none" }}
        onKeyDown={(event) => {
          if (disabled) return;
          const delta = event.shiftKey ? STEP * 5 : STEP;
          if (event.key === "ArrowLeft") nudge(-delta, 0);
          else if (event.key === "ArrowRight") nudge(delta, 0);
          else if (event.key === "ArrowUp") nudge(0, -delta);
          else if (event.key === "ArrowDown") nudge(0, delta);
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragStart.current = { x: event.clientX, y: event.clientY, value: normalized };
        }}
        onPointerMove={(event) => {
          const start = dragStart.current;
          if (!start || disabled) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = start.value.focalX - ((event.clientX - start.x) / Math.max(bounds.width, 1)) * 100 / start.value.zoom;
          const y = start.value.focalY - ((event.clientY - start.y) / Math.max(bounds.height, 1)) * 100 / start.value.zoom;
          onChange(normalizeImageTransform({ ...start.value, focalX: x, focalY: y }));
        }}
        onPointerUp={(event) => {
          dragStart.current = undefined;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => { dragStart.current = undefined; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed preview URL; transform metadata must match runtime rendering. */}
        <img src={src} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" style={style} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/15" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled} onClick={() => nudge(-STEP, 0)} aria-label="Görseli sola kaydır" className="app-input grid h-9 w-9 place-items-center rounded-lg disabled:cursor-not-allowed disabled:text-[var(--app-disabled-text)]"><ChevronLeft className="h-4 w-4" /></button>
        <div className="grid grid-cols-1 gap-1">
          <button type="button" disabled={disabled} onClick={() => nudge(0, -STEP)} aria-label="Görseli yukarı kaydır" className="app-input grid h-7 w-9 place-items-center rounded-lg disabled:cursor-not-allowed disabled:text-[var(--app-disabled-text)]"><ChevronUp className="h-4 w-4" /></button>
          <button type="button" disabled={disabled} onClick={() => nudge(0, STEP)} aria-label="Görseli aşağı kaydır" className="app-input grid h-7 w-9 place-items-center rounded-lg disabled:cursor-not-allowed disabled:text-[var(--app-disabled-text)]"><ChevronDown className="h-4 w-4" /></button>
        </div>
        <button type="button" disabled={disabled} onClick={() => nudge(STEP, 0)} aria-label="Görseli sağa kaydır" className="app-input grid h-9 w-9 place-items-center rounded-lg disabled:cursor-not-allowed disabled:text-[var(--app-disabled-text)]"><ChevronRight className="h-4 w-4" /></button>
        <button type="button" disabled={disabled} onClick={() => updateZoom(normalized.zoom - 0.1)} aria-label="Uzaklaştır" className="app-input ml-auto grid h-9 w-9 place-items-center rounded-lg disabled:cursor-not-allowed disabled:text-[var(--app-disabled-text)]"><Minus className="h-4 w-4" /></button>
        <label className="min-w-36 flex-1 text-xs text-[var(--app-text-muted)]">
          <span className="sr-only">Zoom</span>
          <input type="range" min={IMAGE_TRANSFORM_LIMITS.zoomMin} max={IMAGE_TRANSFORM_LIMITS.zoomMax} step="0.05" value={normalized.zoom} disabled={disabled} onChange={(event) => updateZoom(Number(event.target.value))} className="w-full accent-[var(--app-accent)]" aria-label={`${kind === "banner" ? "Banner" : "Avatar"} zoom`} />
        </label>
        <button type="button" disabled={disabled} onClick={() => updateZoom(normalized.zoom + 0.1)} aria-label="Yakınlaştır" className="app-input grid h-9 w-9 place-items-center rounded-lg disabled:cursor-not-allowed disabled:text-[var(--app-disabled-text)]"><Plus className="h-4 w-4" /></button>
        <button type="button" disabled={disabled} onClick={() => onChange({ ...DEFAULT_IMAGE_TRANSFORM })} className="app-input inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs disabled:cursor-not-allowed disabled:text-[var(--app-disabled-text)]"><RotateCcw className="h-3.5 w-3.5" />Merkeze sıfırla</button>
      </div>
      <p className="text-[11px] text-[var(--app-text-muted)]">Görseli sürükleyebilir, ok tuşlarıyla ince ayar yapabilir ve zoom kontrolünü kullanabilirsin.</p>
    </div>
  );
}
