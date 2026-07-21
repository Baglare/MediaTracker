import { describe, expect, it } from "vitest";
import { canViewModule, canViewProfileDetails, previewContext } from "@/lib/social/visibility";
import type { ModuleVisibility, ProfileVisibility } from "@/lib/social/types";

const contexts = {
  anon: { anonymous: true, self: false, viewerFollowsOwner: false, ownerFollowsViewer: false },
  viewer: { anonymous: false, self: false, viewerFollowsOwner: false, ownerFollowsViewer: false },
  follower: { anonymous: false, self: false, viewerFollowsOwner: true, ownerFollowsViewer: false },
  mutual: { anonymous: false, self: false, viewerFollowsOwner: true, ownerFollowsViewer: true },
  self: { anonymous: false, self: true, viewerFollowsOwner: false, ownerFollowsViewer: false },
};

describe("social visibility matrix", () => {
  it.each<[ProfileVisibility, keyof typeof contexts, boolean]>([
    ["public", "anon", true], ["protected", "anon", true], ["personal", "anon", false],
    ["public", "self", true], ["protected", "self", true], ["personal", "self", true],
  ])("resolves %s profile for %s", (mode, viewer, expected) => {
    expect(canViewProfileDetails(mode, contexts[viewer])).toBe(expected);
  });

  const expectations: Array<[ModuleVisibility, boolean, boolean, boolean, boolean]> = [
    ["public", true, true, true, true],
    ["followers", false, false, true, true],
    ["mutual", false, false, false, true],
    ["self", false, false, false, false],
  ];

  it.each(expectations)("applies %s module visibility", (visibility, anon, viewer, follower, mutual) => {
    expect(canViewModule("public", visibility, contexts.anon)).toBe(anon);
    expect(canViewModule("public", visibility, contexts.viewer)).toBe(viewer);
    expect(canViewModule("protected", visibility, contexts.follower)).toBe(follower);
    expect(canViewModule("protected", visibility, contexts.mutual)).toBe(mutual);
    expect(canViewModule("personal", visibility, contexts.self)).toBe(true);
    expect(canViewModule("personal", visibility, contexts.mutual)).toBe(false);
  });

  it.each<[ModuleVisibility, keyof typeof contexts, boolean]>([
    ["public", "anon", false],
    ["public", "viewer", false],
    ["public", "follower", true],
    ["followers", "follower", true],
    ["mutual", "follower", false],
    ["mutual", "mutual", true],
  ])("raises protected %s modules to the follower minimum for %s", (visibility, viewer, expected) => {
    expect(canViewModule("protected", visibility, contexts[viewer])).toBe(expected);
  });

  it("lets self view every stored module visibility", () => {
    for (const visibility of ["public", "followers", "mutual", "self"] as const) {
      expect(canViewModule("protected", visibility, contexts.self)).toBe(true);
    }
  });

  it("builds deterministic editor preview contexts", () => {
    expect(previewContext("public").anonymous).toBe(true);
    expect(previewContext("followers").viewerFollowsOwner).toBe(true);
    expect(previewContext("mutual").ownerFollowsViewer).toBe(true);
    expect(previewContext("self").self).toBe(true);
  });
});
