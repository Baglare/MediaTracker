"use client";

import type { ReactNode } from "react";
import { useRef } from "react";

export interface SegmentedTabOption<Value extends string> {
  value: Value;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function SegmentedTabs<Value extends string>({
  value,
  options,
  onValueChange,
  label,
  compact = false,
}: {
  value: Value;
  options: readonly SegmentedTabOption<Value>[];
  onValueChange: (value: Value) => void;
  label: string;
  compact?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function move(index: number, direction: 1 | -1) {
    const next = (index + direction + options.length) % options.length;
    refs.current[next]?.focus();
    onValueChange(options[next].value);
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-bg)] p-1"
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); move(index, 1); }
              if (event.key === "ArrowLeft") { event.preventDefault(); move(index, -1); }
              if (event.key === "Home") { event.preventDefault(); refs.current[0]?.focus(); onValueChange(options[0].value); }
              if (event.key === "End") { event.preventDefault(); refs.current.at(-1)?.focus(); onValueChange(options.at(-1)!.value); }
            }}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${
              compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
            } ${
              selected
                ? "bg-[var(--app-selected-bg)] text-[var(--app-selected-text)] shadow-sm ring-1 ring-[var(--app-selected-border)]"
                : "text-[var(--app-text-muted)] hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)]"
            }`}
          >
            {option.icon}
            {option.label}
            {option.count !== undefined && (
              <span className="rounded-full bg-[var(--app-surface-3)] px-1.5 text-[10px] tabular-nums">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
