export interface ImageTransform {
  focalX: number;
  focalY: number;
  zoom: number;
}

export type ImageTransformKind = "avatar" | "banner";

export const DEFAULT_IMAGE_TRANSFORM: Readonly<ImageTransform> = {
  focalX: 50,
  focalY: 50,
  zoom: 1,
};

export const IMAGE_TRANSFORM_LIMITS = {
  focalMin: 0,
  focalMax: 100,
  zoomMin: 1,
  zoomMax: 3,
} as const;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function defaultImageTransform(): ImageTransform {
  return { ...DEFAULT_IMAGE_TRANSFORM };
}

export function normalizeImageTransform(value: unknown, fallback: ImageTransform = defaultImageTransform()): ImageTransform {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    focalX: clamp(finiteOr(record.focalX, fallback.focalX), IMAGE_TRANSFORM_LIMITS.focalMin, IMAGE_TRANSFORM_LIMITS.focalMax),
    focalY: clamp(finiteOr(record.focalY, fallback.focalY), IMAGE_TRANSFORM_LIMITS.focalMin, IMAGE_TRANSFORM_LIMITS.focalMax),
    zoom: clamp(finiteOr(record.zoom, fallback.zoom), IMAGE_TRANSFORM_LIMITS.zoomMin, IMAGE_TRANSFORM_LIMITS.zoomMax),
  };
}

export function isValidImageTransform(value: unknown): value is ImageTransform {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return [record.focalX, record.focalY, record.zoom].every((entry) => typeof entry === "number" && Number.isFinite(entry))
    && Number(record.focalX) >= IMAGE_TRANSFORM_LIMITS.focalMin
    && Number(record.focalX) <= IMAGE_TRANSFORM_LIMITS.focalMax
    && Number(record.focalY) >= IMAGE_TRANSFORM_LIMITS.focalMin
    && Number(record.focalY) <= IMAGE_TRANSFORM_LIMITS.focalMax
    && Number(record.zoom) >= IMAGE_TRANSFORM_LIMITS.zoomMin
    && Number(record.zoom) <= IMAGE_TRANSFORM_LIMITS.zoomMax;
}

export function bannerPositionFallback(position: "top" | "center" | "bottom"): ImageTransform {
  return { focalX: 50, focalY: position === "top" ? 0 : position === "bottom" ? 100 : 50, zoom: 1 };
}

export interface ResolvedImageTransformStyle {
  objectPosition: string;
  transform: string;
  transformOrigin: string;
}

export function resolveImageTransformStyle(value: unknown, kind: ImageTransformKind, fallback?: ImageTransform): ResolvedImageTransformStyle {
  const transform = normalizeImageTransform(value, fallback);
  const origin = `${transform.focalX}% ${transform.focalY}%`;
  return {
    objectPosition: origin,
    transform: `scale(${transform.zoom})`,
    transformOrigin: origin,
  };
}

export function nudgeImageTransform(value: ImageTransform, deltaX: number, deltaY: number): ImageTransform {
  return normalizeImageTransform({ ...value, focalX: value.focalX + deltaX, focalY: value.focalY + deltaY });
}
