import type { AspectStrengthLevel, RecommendationDecodeResult } from "./types";

export const ASPECT_STRENGTH_THRESHOLDS = Object.freeze({
  primary: 0.75,
  significant: 0.5,
  incidental: 0.2,
  absent: 0,
} as const);

export class AspectStrengthError extends RangeError {
  readonly code = "aspect_strength_invalid";

  constructor(value: unknown) {
    super(`Aspect strength 0 ile 1 arasında finite bir sayı veya null olmalıdır: ${String(value)}`);
    this.name = "AspectStrengthError";
  }
}

export function isValidAspectStrength(value: unknown): value is number | null {
  return value === null
    || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
}

export function strengthToLevel(strength: number | null): AspectStrengthLevel {
  if (!isValidAspectStrength(strength)) throw new AspectStrengthError(strength);
  if (strength === null) return "unknown";
  if (strength >= ASPECT_STRENGTH_THRESHOLDS.primary) return "primary";
  if (strength >= ASPECT_STRENGTH_THRESHOLDS.significant) return "significant";
  if (strength >= ASPECT_STRENGTH_THRESHOLDS.incidental) return "incidental";
  return "absent";
}

export function validateStrengthLevelPair(
  strength: unknown,
  level: unknown,
  path = "evidence",
): RecommendationDecodeResult<{ strength: number | null; level: AspectStrengthLevel }> {
  if (!isValidAspectStrength(strength)) {
    return {
      ok: false,
      issues: [{
        code: "aspect_strength_invalid",
        path: `${path}.strength`,
        message: "Strength 0 ile 1 arasında finite bir sayı veya null olmalıdır.",
      }],
    };
  }
  const canonicalLevel = strengthToLevel(strength);
  if (level !== canonicalLevel) {
    return {
      ok: false,
      issues: [{
        code: "aspect_level_mismatch",
        path: `${path}.level`,
        message: `Level strength değerinden türetilen ${canonicalLevel} ile eşleşmiyor.`,
      }],
    };
  }
  return { ok: true, value: { strength, level: canonicalLevel } };
}
