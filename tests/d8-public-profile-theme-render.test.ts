import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { SocialProfileView } from "@/components/social/social-profile-view";
import { defaultProfilePresentationPreferences } from "@/lib/personalization/defaults";
import { buildPublicProfileThemeSnapshot } from "@/lib/personalization/public-profile-theme";
import type { PublicProfileThemeSnapshot } from "@/lib/personalization/types";
import type { SocialProfilePayload } from "@/lib/social/types";

function payload(themeSnapshot?: PublicProfileThemeSnapshot, anonymous = true): SocialProfilePayload {
  return {
    status: "available",
    profile: {
      id: "owner-fixture",
      username: "owner",
      displayName: "Owner",
      tagline: "",
      bio: "",
      visibilityMode: "public",
      connectionColor: "neutral",
      joinedAt: "2026-01-01T00:00:00.000Z",
      presentation: defaultProfilePresentationPreferences(),
      themeSnapshot,
    },
    relationship: {
      viewerFollowsOwner: null,
      ownerFollowsViewer: null,
      self: false,
      anonymous,
      state: anonymous ? "anonymous" : "none",
      ownerColor: "neutral",
      viewerColor: "violet",
    },
    modules: [],
    favorites: [],
    current: [],
    sharedNotes: [],
  };
}

function render(profile: SocialProfilePayload): string {
  return renderToStaticMarkup(createElement(SocialProfileView, { payload: profile }));
}

describe("public profile route theme render", () => {
  it("renders one scoped preset marker and semantic variables for guest and authenticated viewers", () => {
    const snapshot = buildPublicProfileThemeSnapshot({ visibility: "preset_only", publicPreset: "porcelain" })!;
    for (const anonymous of [true, false]) {
      const html = render(payload(snapshot, anonymous));
      expect(html.match(/data-public-profile-route/g)).toHaveLength(1);
      expect(html).toContain('data-profile-theme-source="preset"');
      expect(html).toContain("--app-bg:");
    }
  });

  it("renders a persisted custom snapshot without leaking its private definition", () => {
    const snapshot = buildPublicProfileThemeSnapshot({
      visibility: "current_theme",
      currentTheme: {
        kind: "custom",
        theme: {
          version: 1,
          id: "ct_12345678",
          name: "Fixture",
          createdAt: "2026-08-10T00:00:00.000Z",
          updatedAt: "2026-08-10T00:00:00.000Z",
          inputs: {
            colorScheme: "dark",
            background: "#09090B",
            surface: "#18181B",
            accent: "#8B5CF6",
            secondaryAccent: "#F59E0B",
          },
        },
      },
    })!;
    expect(snapshot).toBeDefined();
    const html = render(payload(snapshot, false));
    expect(html).toContain('data-profile-theme-source="custom"');
    expect(html).toContain("--app-text-primary:");
    expect(html).not.toContain("ct_12345678");
  });

  it("leaves hidden and unavailable states on visitor semantics", () => {
    expect(render(payload())).toContain('data-profile-theme-source="visitor"');
    for (const status of ["personal", "unavailable", "not_found"] as const) {
      const html = render({ ...payload(), status, profile: undefined, relationship: undefined });
      expect(html).toContain('data-profile-theme-source="visitor"');
      expect(html).not.toContain("--app-bg:");
    }
  });
});
