"use client";

import { useId, useState } from "react";

import { COLOR_CATALOG } from "@/lib/personalization/color-catalog";
import { hexToRgb, normalizeHexColor, rgbToHex } from "@/lib/personalization/color-utils";

interface ColorFieldProps {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}

export function ColorField({ label, value, defaultValue, onChange }: ColorFieldProps) {
  const id = useId();
  const [hexDraft, setHexDraft] = useState({ source: value, value });
  const draftHex = hexDraft.source === value ? hexDraft.value : value;
  const rgb = hexToRgb(value) ?? { r: 0, g: 0, b: 0 };

  const commitHex = () => {
    const normalized = normalizeHexColor(draftHex);
    if (normalized) {
      setHexDraft({ source: normalized, value: normalized });
      onChange(normalized);
    } else {
      setHexDraft({ source: value, value });
    }
  };

  const updateRgb = (channel: "r" | "g" | "b", raw: string) => {
    if (raw === "") return;
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    onChange(rgbToHex({ ...rgb, [channel]: next }));
  };

  return (
    <fieldset className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3">
      <legend className="px-1 text-sm font-semibold text-[var(--app-text-primary)]">{label}</legend>
      <div className="mt-1 flex flex-wrap items-end gap-2">
        <label className="grid min-h-11 min-w-16 cursor-pointer place-items-center rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] p-1 focus-within:ring-2 focus-within:ring-[var(--app-focus)]">
          <span className="sr-only">{label} için renk seçici</span>
          <input
            type="color"
            value={value.toLowerCase()}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="h-8 w-12 cursor-pointer border-0 bg-transparent"
          />
        </label>
        <label className="min-w-32 flex-1 text-xs text-[var(--app-text-muted)]">
          HEX
          <input
            id={`${id}-hex`}
            value={draftHex}
            onChange={(event) => setHexDraft({ source: value, value: event.target.value })}
            onBlur={commitHex}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitHex();
            }}
            aria-invalid={!normalizeHexColor(draftHex)}
            className="app-input mt-1 min-h-11 w-full rounded-lg px-3 font-mono uppercase"
          />
        </label>
        {(["r", "g", "b"] as const).map((channel) => (
          <label key={channel} className="w-16 text-xs uppercase text-[var(--app-text-muted)]">
            {channel}
            <input
              type="number"
              min={0}
              max={255}
              step={1}
              value={rgb[channel]}
              onChange={(event) => updateRgb(channel, event.target.value)}
              className="app-input mt-1 min-h-11 w-full rounded-lg px-2 text-center"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={() => onChange(defaultValue)}
          className="min-h-11 rounded-lg border border-[var(--app-border)] px-3 text-xs font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
        >
          Sıfırla
        </button>
      </div>
      {!normalizeHexColor(draftHex) && (
        <p className="mt-2 text-xs text-[var(--app-danger)]" role="alert">
          3 veya 6 haneli geçerli bir HEX değeri gir.
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-[var(--app-text-secondary)]">
          Hazır renk kataloğu
        </summary>
        <div className="mt-3 space-y-3">
          {COLOR_CATALOG.map((group) => (
            <div key={group.id}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.colors.map((color) => (
                  <button
                    key={`${group.id}-${color.hex}`}
                    type="button"
                    title={`${color.name} · ${color.hex}`}
                    aria-label={`${label}: ${color.name}, ${color.hex}`}
                    onClick={() => onChange(color.hex)}
                    className="h-9 w-9 rounded-lg border border-[var(--app-border-strong)] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </fieldset>
  );
}
