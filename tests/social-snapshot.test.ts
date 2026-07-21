import { describe, expect, it } from "vitest";
import { buildProgressionSnapshot, buildStatsSnapshot, prefillSocialProfile, selectedSnapshotData } from "@/lib/social/snapshots";
import { validateImageUpload, validateMediaSnapshot, validateSharedNote } from "@/lib/social/validation";
import { DEFAULT_PROFILE_PREFERENCES } from "@/lib/profile-preferences";
import type { MediaItem } from "@/lib/types";

const media = [
  { id: "a", title: "A", type: "anime", status: "completed", favorite: true, userRating: 9, currentProgress: 12, totalProgress: 12, coverImage: "https://example.com/a.jpg" },
  { id: "b", title: "B", type: "movie", status: "watching", favorite: false, currentProgress: 0, totalProgress: 1, personalNotes: "private" },
  { id: "c", title: "C", type: "book", status: "planning", favorite: false, currentProgress: 0, totalProgress: 1 },
] as MediaItem[];

describe("social snapshots and local prefill", () => {
  it("publishes aggregate stats without raw library rows", () => {
    const snapshot = buildStatsSnapshot(media, new Date("2026-07-21T00:00:00.000Z"));
    expect(snapshot).toMatchObject({ totalMedia: 3, completed: 1, active: 1, planning: 1, favorites: 1, rated: 1, worldCounts: { east: 1, screen: 1, arch: 1 } });
    expect(JSON.stringify(snapshot)).not.toContain("private");
  });

  it("versions a non-authoritative progression snapshot", () => {
    const snapshot = buildProgressionSnapshot({ totalXp: 250, level: 2, title: "Gezgin", tier: "basic", dominantWorld: "mixed", currentLevelStartXp: 100, nextLevelStartXp: 400, currentLevelXp: 150, nextLevelXp: 300, progressPercent: .5, worldCounts: { east: 1, screen: 1, arch: 1, mixed: 0 } }, new Date("2026-07-21T00:00:00.000Z"));
    expect(snapshot).toMatchObject({ version: 1, totalXp: 250, progressPercent: .5 });
  });

  it("uses local preferences only as form prefill", () => {
    const prefill = prefillSocialProfile({ ...DEFAULT_PROFILE_PREFERENCES, displayName: "Bağlare", profileTagline: "Yerel bio", avatarImageDataUrl: "data:image/png;base64,secret" }, "Fallback", "Yolcu");
    expect(prefill).toMatchObject({ username: "", displayName: "Bağlare", bio: "Yerel bio", visibilityMode: "personal" });
    expect(JSON.stringify(prefill)).not.toContain("data:image");
    expect(JSON.stringify(prefill)).not.toContain("library");
  });

  it("selects only safe media fields for explicit showcase editing", () => {
    const selected = selectedSnapshotData(media);
    expect(selected[1]).not.toHaveProperty("personalNotes");
    expect(selected).toHaveLength(3);
  });

  it("requires explicit confirmation and validates note privacy fields", () => {
    const input = { mediaTitle: "B", mediaType: "movie", content: "Paylaşılacak snapshot", containsSpoiler: true, visibility: "followers" };
    expect(validateSharedNote({ ...input, confirmed: false }).ok).toBe(false);
    expect(validateSharedNote({ ...input, confirmed: true }).ok).toBe(true);
    expect(validateSharedNote({ ...input, confirmed: true, visibility: "self" }).ok).toBe(false);
    expect(validateSharedNote({ ...input, confirmed: true, containsSpoiler: "yes" }).ok).toBe(false);
    expect(validateSharedNote({ ...input, confirmed: true, content: "x".repeat(2001) }).ok).toBe(false);
  });

  it("validates media snapshot duplicates at caller boundary and safe HTTPS covers", () => {
    const valid = { title: "A", mediaType: "anime", coverUrl: "https://example.com/a.jpg", world: "east", sortOrder: 0 };
    expect(validateMediaSnapshot(valid).ok).toBe(true);
    expect(validateMediaSnapshot({ ...valid, coverUrl: "http://example.com/a.jpg" }).ok).toBe(false);
    expect(validateMediaSnapshot({ ...valid, sortOrder: 5 }).ok).toBe(false);
  });

  it("enforces avatar and banner MIME/size limits", () => {
    expect(validateImageUpload("avatar", "image/webp", 5 * 1024 * 1024).ok).toBe(true);
    expect(validateImageUpload("avatar", "image/webp", 5 * 1024 * 1024 + 1).ok).toBe(false);
    expect(validateImageUpload("banner", "image/png", 10 * 1024 * 1024).ok).toBe(true);
    expect(validateImageUpload("banner", "image/gif", 100).ok).toBe(false);
  });
});
