import "./helpers/admitted-rate-limit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_PROFILE_PREFERENCES } from "@/lib/profile-preferences";
import { localAvatarDataUrlToFile, migrateLocalAvatar, resolveAvatarSource, shouldOfferLocalAvatarMigration } from "@/lib/social/avatar";
import { prefillSocialProfile } from "@/lib/social/snapshots";

const { getSupabaseServerClientMock } = vi.hoisted(() => ({
  getSupabaseServerClientMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

import { loadSocialProfile } from "@/lib/social/server";
import { POST as uploadAsset } from "@/app/api/social/assets/route";

function availableProfile(avatarPath?: string | null) {
  return {
    status: "available",
    profile: {
      id: "00000000-0000-4000-8000-000000000001",
      username: "owner",
      displayName: "Owner",
      visibilityMode: "protected",
      connectionColor: "violet",
      avatarPath,
    },
    relationship: {
      viewerFollowsOwner: "accepted",
      ownerFollowsViewer: null,
      self: false,
      anonymous: false,
      viewerConnectionColor: "cyan",
    },
    modules: [],
    favorites: [],
    current: [],
    sharedNotes: [],
  };
}

function setupClient(data: unknown) {
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/avatar" }, error: null });
  const client = {
    rpc: vi.fn().mockResolvedValue({ data, error: null }),
    storage: { from: vi.fn(() => ({ createSignedUrl })) },
  };
  getSupabaseServerClientMock.mockResolvedValue(client);
  return { client, createSignedUrl };
}

describe("social avatar boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("migrates local bytes without a data URL network request under the strict CSP", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    try {
      const original = "data:image/png;base64,AQID";
      const upload = vi.fn(async (dataUrl: string) => {
        const file = localAvatarDataUrlToFile(dataUrl);
        expect(file.type).toBe("image/png");
        expect(file.name).toBe("profile-avatar.png");
        expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
        return "/api/backend/assets?key=synthetic";
      });
      await expect(migrateLocalAvatar({ confirmed: true, localAvatarDataUrl: original, upload }))
        .resolves.toEqual({ status: "uploaded", value: "/api/backend/assets?key=synthetic" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(original).toBe("data:image/png;base64,AQID");
    } finally { fetchMock.mockRestore(); }
  });

  it("rejects remote, executable, malformed and oversized avatar inputs before decoding", () => {
    for (const value of ["https://example.test/avatar.png", "data:image/svg+xml;base64,AQID",
      "data:image/png;base64,", "data:image/png;base64,A", "data:image/png;base64,%%",
      `data:image/png;base64,${"A".repeat(7 * 1024 * 1024)}`]) {
      expect(() => localAvatarDataUrlToFile(value)).toThrow();
    }
    expect(localAvatarDataUrlToFile("data:image/jpeg;base64,AQID").type).toBe("image/jpeg");
    expect(localAvatarDataUrlToFile("data:image/webp;base64,AQID").type).toBe("image/webp");
  });

  it("propagates a failed upload without changing the local avatar or declaring success", async () => {
    const original = "data:image/png;base64,AQID";
    const upload = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(migrateLocalAvatar({ confirmed: true, localAvatarDataUrl: original, upload })).rejects.toThrow("Failed to fetch");
    expect(original).toBe("data:image/png;base64,AQID");
    expect(upload).toHaveBeenCalledOnce();
  });

  it("omits avatarUrl when avatar_path is null", async () => {
    const { createSignedUrl } = setupClient(availableProfile(null));
    const payload = await loadSocialProfile("owner");

    expect(JSON.stringify(payload)).not.toContain("avatarUrl");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("returns a signed avatarUrl for an authorized profile response", async () => {
    const { createSignedUrl } = setupClient(availableProfile("owner-id/avatar/image.webp"));
    const payload = await loadSocialProfile("owner");

    expect(payload.profile?.avatarUrl).toBe("https://signed.example/avatar");
    expect(createSignedUrl).toHaveBeenCalledWith("owner-id/avatar/image.webp", 300);
  });

  it("does not sign an avatar for an anonymous personal profile response", async () => {
    const { createSignedUrl } = setupClient({ status: "personal", profile: { avatarPath: "owner/avatar/private.webp" } });
    const payload = await loadSocialProfile("owner");

    expect(payload.status).toBe("personal");
    expect(JSON.stringify(payload)).not.toContain("avatarUrl");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("does not sign an avatar for a blocked viewer response", async () => {
    const { createSignedUrl } = setupClient({ status: "unavailable", profile: { avatarPath: "owner/avatar/private.webp" } });
    const payload = await loadSocialProfile("owner");

    expect(payload.status).toBe("unavailable");
    expect(JSON.stringify(payload)).not.toContain("avatarUrl");
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("never turns a local data URL into a social cloud path", () => {
    const prefill = prefillSocialProfile({
      ...DEFAULT_PROFILE_PREFERENCES,
      avatarMode: "image",
      avatarImageDataUrl: "data:image/png;base64,local-only",
    }, "Owner", "Gezgin");

    expect(JSON.stringify(prefill)).not.toContain("data:image");
    expect(prefill).not.toHaveProperty("avatarPath");
    expect(prefill).not.toHaveProperty("avatarUrl");
  });

  it("prefers the social avatar over the local fallback in every own-profile surface", () => {
    const localPreferences = { avatarMode: "image" as const, avatarImageDataUrl: "data:image/png;base64,local" };
    const surfaces = ["sidebar", "topbar", "profile", "editor"];
    for (const surface of surfaces) {
      expect(resolveAvatarSource({ socialAvatarUrl: "https://signed.example/cloud", localPreferences, allowLocalFallback: true })).toEqual({
        source: "social",
        imageUrl: "https://signed.example/cloud",
      });
      expect(surface).toBeTruthy();
    }
  });

  it("uses the local avatar only for the signed-in user's own fallback", () => {
    const localPreferences = { avatarMode: "image" as const, avatarImageDataUrl: "data:image/png;base64,local" };
    expect(resolveAvatarSource({ localPreferences, allowLocalFallback: true }).source).toBe("local");
    expect(resolveAvatarSource({ localPreferences, allowLocalFallback: false })).toEqual({ source: "initials" });
  });

  it("uses initials when neither a permitted social nor local avatar exists", () => {
    expect(resolveAvatarSource({ allowLocalFallback: false })).toEqual({ source: "initials" });
  });

  it("offers migration only for an undismissed local image owned by a social user", () => {
    expect(shouldOfferLocalAvatarMigration({ authenticated: true, hasSocialProfile: true, localAvatarDataUrl: "data:image/png;base64,local", dismissed: false })).toBe(true);
    expect(shouldOfferLocalAvatarMigration({ authenticated: true, hasSocialProfile: true, localAvatarDataUrl: "data:image/png;base64,local", dismissed: true })).toBe(false);
  });

  it("does not upload local avatar migration without explicit confirmation", async () => {
    const upload = vi.fn().mockResolvedValue("https://signed.example/cloud");
    await expect(migrateLocalAvatar({ confirmed: false, localAvatarDataUrl: "data:image/png;base64,local", upload })).resolves.toEqual({ status: "skipped" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads local avatar migration after explicit confirmation", async () => {
    const upload = vi.fn().mockResolvedValue("https://signed.example/cloud");
    await expect(migrateLocalAvatar({ confirmed: true, localAvatarDataUrl: "data:image/png;base64,local", upload })).resolves.toEqual({ status: "uploaded", value: "https://signed.example/cloud" });
    expect(upload).toHaveBeenCalledOnce();
  });

  it("keeps the existing cloud avatar path when a replacement upload fails", async () => {
    const update = vi.fn();
    const remove = vi.fn();
    const upload = vi.fn().mockResolvedValue({ error: new Error("upload failed") });
    getSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "owner-id" } } }) },
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { avatar_path: "owner-id/avatar/old.webp", banner_path: null } }) })) })),
        update,
      })),
      storage: { from: vi.fn(() => ({ upload, remove, createSignedUrl: vi.fn() })) },
    });
    const form = new FormData();
    form.set("kind", "avatar");
    form.set("file", new File([new Uint8Array([1, 2, 3])], "avatar.webp", { type: "image/webp" }));

    const response = await uploadAsset(new Request("http://localhost/api/social/assets", { method: "POST", headers: { Origin: "http://localhost" }, body: form }));

    expect(response.status).toBe(500);
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
