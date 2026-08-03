import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const card = readFileSync("components/media-card.tsx", "utf8");
const favoriteStart = card.indexOf('title={isFavorite ? "Favoriden Çıkar"');
const favoriteEnd = card.indexOf("</button>", favoriteStart);
const favorite = card.slice(favoriteStart, favoriteEnd);

describe("media card favorite ribbon", () => {
  it("keeps a compact bookmark attached to the top-right edge", () => {
    expect(favorite).toContain("absolute right-3 top-0");
    expect(favorite).toContain("h-11 w-9");
    expect(favorite).toContain("data-favorite-ribbon");
    expect(favorite).toContain("h-9 w-6");
  });

  it("uses the previous clipped bookmark notch instead of a square button", () => {
    expect(favorite).toContain("clipPath");
    expect(favorite).toContain("polygon(0 0, 100% 0, 100% 100%, 50% 58%, 0 100%)");
    expect(favorite).toContain("drop-shadow-[0_2px_2px_var(--app-shadow)]");
    expect(favorite).not.toContain("rounded-lg border");
    expect(favorite).not.toContain("right-2 top-2");
  });

  it("uses a semantic passive surface and a separate rose favorite state", () => {
    expect(favorite).toContain("var(--app-surface-elevated)");
    expect(favorite).toContain("var(--app-border-strong)");
    expect(favorite).toContain("from-rose-400 to-rose-600");
    expect(favorite).not.toMatch(/connectionColor|var\(--app-accent\)|var\(--w-/);
  });

  it("keeps filled and outline heart states", () => {
    expect(favorite).toContain('isFavorite ? "fill-current scale-110" : "scale-100"');
  });

  it("exposes pressed state, accessible labels and keyboard focus", () => {
    expect(favorite).toContain("aria-pressed={isFavorite}");
    expect(favorite).toContain("aria-label=");
    expect(favorite).toContain("focus-visible:ring-2");
  });

  it("preserves the favorite toggle callback", () => {
    expect(card).toContain("onToggleFavorite(item.id)");
    expect(card).toContain("e.stopPropagation()");
  });

  it("reserves title space so the control does not overlap it", () => {
    expect(card).toContain('className="min-w-0 pr-7"');
    expect(card).toContain("line-clamp-2 min-h-[2.25rem]");
  });
});
