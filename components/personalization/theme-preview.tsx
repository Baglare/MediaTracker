import type { CSSProperties } from "react";

import { themeTokensToCssVariables } from "@/lib/personalization/appearance-runtime";
import type { AppThemeTokens } from "@/lib/personalization/types";

export function ThemePreview({ tokens }: { tokens: AppThemeTokens }) {
  const style = themeTokensToCssVariables(tokens) as CSSProperties;
  return (
    <div
      style={style}
      className="overflow-hidden rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-bg)] text-[var(--app-text-primary)] shadow-sm"
      aria-label="Tema canlı önizlemesi"
    >
      <div className="grid min-h-72 grid-cols-[4.5rem_1fr]">
        <aside className="border-r border-[var(--app-border)] bg-[var(--app-surface-1)] p-3" aria-label="Mini kenar çubuğu">
          <div className="h-8 rounded-lg bg-[var(--app-accent)]" />
          <div className="mt-4 space-y-2">
            <div className="h-2 rounded bg-[var(--app-text-secondary)]" />
            <div className="h-2 rounded bg-[var(--app-text-muted)]" />
            <div className="h-2 rounded bg-[var(--app-text-muted)]" />
          </div>
        </aside>
        <div className="p-4">
          <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-hero-bg)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--app-accent-strong)]">MediaTracker</p>
            <h4 className="mt-1 text-lg font-bold">Tema önizlemesi</h4>
            <p className="mt-1 text-xs text-[var(--app-text-muted)]">Yüzey, metin ve kontroller birlikte değerlendirilir.</p>
          </div>
          <div className="mt-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-bg)] p-3">
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)] p-3">
              <p className="text-sm font-semibold">Örnek kart</p>
              <p className="mt-1 text-xs text-[var(--app-text-secondary)]">İkincil metin ve panel katmanı.</p>
              <input
                readOnly
                value="Örnek alan"
                className="mt-3 min-h-10 w-full rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-input-bg)] px-3 text-xs"
                aria-label="Örnek giriş alanı"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="min-h-10 rounded-lg bg-[var(--app-accent)] px-3 text-xs font-semibold text-[var(--app-accent-contrast)]">Ana aksiyon</button>
                <button type="button" className="min-h-10 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] px-3 text-xs">İkincil</button>
                <span className="inline-flex min-h-10 items-center rounded-lg border border-[var(--app-selected-border)] bg-[var(--app-selected-bg)] px-3 text-xs text-[var(--app-selected-text)]">Seçili</span>
              </div>
              <div className="mt-3 flex gap-3 text-xs">
                <span className="text-[var(--app-success)]">Başarılı</span>
                <span className="text-[var(--app-warning)]">Uyarı</span>
                <span className="text-[var(--app-danger)]">Hata</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
