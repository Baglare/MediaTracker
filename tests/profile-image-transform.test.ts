import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_TRANSFORM,
  bannerPositionFallback,
  isValidImageTransform,
  normalizeImageTransform,
  nudgeImageTransform,
  resolveImageTransformStyle,
} from "@/lib/personalization/image-transform";
import { normalizeProfilePresentationPreferences } from "@/lib/personalization/validation";

describe("profile image transform", () => {
  it("uses a centered non-destructive default", () => {
    expect(DEFAULT_IMAGE_TRANSFORM).toEqual({ focalX: 50, focalY: 50, zoom: 1 });
  });

  it("normalizes focal and zoom bounds and rejects non-finite input", () => {
    expect(normalizeImageTransform({ focalX: -20, focalY: 120, zoom: 9 })).toEqual({ focalX: 0, focalY: 100, zoom: 3 });
    expect(isValidImageTransform({ focalX: 50, focalY: 50, zoom: Number.NaN })).toBe(false);
    expect(isValidImageTransform({ focalX: 50, focalY: 50, zoom: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it("builds safe shared render values", () => {
    expect(resolveImageTransformStyle({ focalX: 25, focalY: 70, zoom: 1.5 }, "banner")).toEqual({
      objectPosition: "25% 70%",
      transform: "scale(1.5)",
      transformOrigin: "25% 70%",
    });
  });

  it("supports nudge, reset bounds and legacy banner position fallback", () => {
    expect(nudgeImageTransform({ focalX: 99, focalY: 1, zoom: 1 }, 5, -5)).toEqual({ focalX: 100, focalY: 0, zoom: 1 });
    expect(bannerPositionFallback("top").focalY).toBe(0);
    expect(bannerPositionFallback("bottom").focalY).toBe(100);
  });

  it("normalizes missing transforms from the legacy banner position", () => {
    const value = normalizeProfilePresentationPreferences({ version: 1, bannerPosition: "bottom" });
    expect(value.bannerTransform).toEqual({ focalX: 50, focalY: 100, zoom: 1 });
    expect(value.avatarTransform).toEqual(DEFAULT_IMAGE_TRANSFORM);
  });
});
