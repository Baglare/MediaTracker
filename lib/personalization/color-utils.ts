export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const SHORT_HEX = /^#?([0-9a-f]{3})$/i;
const LONG_HEX = /^#?([0-9a-f]{6})$/i;

function byte(value: number): number {
  if (!Number.isFinite(value)) throw new Error("invalid_rgb_channel");
  return Math.min(255, Math.max(0, Math.round(value)));
}

export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const short = trimmed.match(SHORT_HEX);
  if (short) {
    return `#${short[1].split("").map((part) => `${part}${part}`).join("")}`.toUpperCase();
  }
  const long = trimmed.match(LONG_HEX);
  return long ? `#${long[1].toUpperCase()}` : null;
}

export function rgbToHex(color: RgbColor): string {
  return `#${[byte(color.r), byte(color.g), byte(color.b)]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export function hexToRgb(value: unknown): RgbColor | null {
  const normalized = normalizeHexColor(value);
  if (!normalized) return null;
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function mixHexColors(
  first: string,
  second: string,
  secondWeight: number,
): string {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  if (!a || !b || !Number.isFinite(secondWeight)) throw new Error("invalid_color_mix");
  const weight = Math.min(1, Math.max(0, secondWeight));
  return rgbToHex({
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight,
  });
}

export function hexToRgba(value: string, alpha: number): string {
  const rgb = hexToRgb(value);
  if (!rgb || !Number.isFinite(alpha)) throw new Error("invalid_rgba");
  const normalizedAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedAlpha})`;
}

function linearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(value: string): number {
  const rgb = hexToRgb(value);
  if (!rgb) throw new Error("invalid_luminance_color");
  return (
    0.2126 * linearChannel(rgb.r)
    + 0.7152 * linearChannel(rgb.g)
    + 0.0722 * linearChannel(rgb.b)
  );
}

export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

export function bestContrastingText(background: string): "#000000" | "#FFFFFF" {
  return contrastRatio("#000000", background) >= contrastRatio("#FFFFFF", background)
    ? "#000000"
    : "#FFFFFF";
}
