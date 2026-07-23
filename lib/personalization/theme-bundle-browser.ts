"use client";

import {
  MAX_THEME_BUNDLE_BYTES,
  type MediaTrackerThemeBundleV1,
  serializeThemeBundle,
} from "./theme-bundle";

export function downloadThemeBundle(
  bundle: MediaTrackerThemeBundleV1,
  filename: string,
): void {
  const blob = new Blob([serializeThemeBundle(bundle)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readThemeBundleFile(file: File): Promise<string> {
  const hasJsonExtension = file.name.toLowerCase().endsWith(".json");
  const acceptableMime = file.type === "" || file.type === "application/json";
  if (!hasJsonExtension || !acceptableMime) throw new Error("theme_file_type");
  if (file.size > MAX_THEME_BUNDLE_BYTES) throw new Error("theme_file_size");
  const text = await file.text();
  if (new TextEncoder().encode(text).byteLength > MAX_THEME_BUNDLE_BYTES) {
    throw new Error("theme_file_size");
  }
  return text;
}
