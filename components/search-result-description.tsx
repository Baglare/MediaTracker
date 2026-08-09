import { normalizeSearchResultDescription } from "@/lib/search-result-description";

export function SearchResultDescription({ value, className = "" }: { value: unknown; className?: string }) {
  const text = normalizeSearchResultDescription(value);
  if (!text) return null;
  return <p className={`mt-1.5 line-clamp-2 max-h-10 overflow-hidden [overflow-wrap:anywhere] text-xs leading-5 text-[var(--app-text-muted)] sm:line-clamp-3 sm:max-h-[3.75rem] ${className}`}>{text}</p>;
}
