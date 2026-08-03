"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

interface CollapsibleSectionProps {
  storageKey: string;
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
  alert?: boolean;
  badge?: ReactNode;
  icon?: ReactNode;
  className?: string;
  contentClassName?: string;
  headingLevel?: "h2" | "h3" | "h4";
  anchorId?: string;
}

export function CollapsibleSection({
  storageKey,
  title,
  description,
  children,
  defaultOpen = false,
  alert = false,
  badge,
  icon,
  className = "",
  contentClassName = "",
  headingLevel: Heading = "h2",
  anchorId,
}: CollapsibleSectionProps) {
  const generatedId = useId().replace(/:/g, "");
  const contentId = `collapsible-${generatedId}`;
  const [userOpen, setUserOpen] = useState(() => {
    if (typeof window === "undefined") return defaultOpen || alert;
    if (anchorId && window.location.hash === `#${anchorId}`) return true;
    if (alert) return true;
    try {
      const stored = window.sessionStorage.getItem(`mediaTracker:uiSection:${storageKey}`);
      if (stored === "open" || stored === "closed") return stored === "open";
    } catch {
      // Session storage kullanılamıyorsa güvenli varsayılanla devam et.
    }
    return defaultOpen;
  });
  const open = alert || userOpen;

  const toggle = () => {
    setUserOpen((current) => {
      const next = !current;
      try {
        window.sessionStorage.setItem(
          `mediaTracker:uiSection:${storageKey}`,
          next ? "open" : "closed",
        );
      } catch {
        // Depolama engellense de bölüm yerel olarak açılıp kapanabilsin.
      }
      return next;
    });
  };

  return (
    <section id={anchorId} className={className} data-collapsible-section={storageKey}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-start justify-between gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3 text-left transition-colors hover:bg-[var(--app-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
      >
        <span className="flex min-w-0 items-start gap-3">
          {icon && <span className="mt-0.5 shrink-0" aria-hidden="true">{icon}</span>}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <Heading className="text-sm font-semibold text-[var(--app-text-primary)]">
                {title}
              </Heading>
              {badge}
              {alert && (
                <span className="rounded-md border border-[var(--app-danger)] bg-[var(--app-danger-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--app-danger)]">
                  İşlem gerekli
                </span>
              )}
            </span>
            <span className="mt-1 block text-xs leading-5 text-[var(--app-text-muted)]">
              {description}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`mt-1 h-4 w-4 shrink-0 text-[var(--app-text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <div
        id={contentId}
        hidden={!open}
        className={`mt-3 ${contentClassName}`}
      >
        {children}
      </div>
    </section>
  );
}
