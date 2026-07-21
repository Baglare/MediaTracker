import { describe, expect, it } from "vitest";
import { buildYinYangConnectionViewModel, decideFollow, removeRelationshipsOnBlock, resolveConnectionState } from "@/lib/social/relationships";

describe("social follow, block and Yin/Yang state", () => {
  it.each([
    [false, null, null, "anonymous"],
    [true, null, null, "self"],
    [false, "accepted", null, "viewer_follows"],
    [false, null, "accepted", "owner_follows"],
    [false, "accepted", "accepted", "mutual"],
    [false, "pending", null, "outbound_pending"],
    [false, null, "pending", "inbound_pending"],
    [false, null, null, "none"],
  ] as const)("resolves connection state", (self, outgoing, incoming, expected) => {
    expect(resolveConnectionState({ self, anonymous: expected === "anonymous", viewerFollowsOwner: outgoing, ownerFollowsViewer: incoming })).toBe(expected);
  });

  it("accepts public follows immediately and protects protected profiles", () => {
    expect(decideFollow({ visibility: "public", self: false, blocked: false, existing: null })).toEqual({ ok: true, status: "accepted" });
    expect(decideFollow({ visibility: "protected", self: false, blocked: false, existing: null })).toEqual({ ok: true, status: "pending" });
  });

  it.each([
    [{ visibility: "personal", self: false, blocked: false, existing: null }, "personal"],
    [{ visibility: "public", self: true, blocked: false, existing: null }, "self"],
    [{ visibility: "public", self: false, blocked: true, existing: null }, "blocked"],
    [{ visibility: "public", self: false, blocked: false, existing: "accepted" }, "duplicate"],
    [{ visibility: "protected", self: false, blocked: false, existing: "pending" }, "duplicate"],
  ] as const)("rejects invalid follow", (args, reason) => {
    expect(decideFollow(args)).toEqual({ ok: false, reason });
  });

  it("removes accepted and pending relations in both directions on block", () => {
    const rows = [
      { followerId: "a", followingId: "b", status: "accepted" },
      { followerId: "b", followingId: "a", status: "pending" },
      { followerId: "c", followingId: "a", status: "accepted" },
    ];
    expect(removeRelationshipsOnBlock(rows, "a", "b")).toEqual([rows[2]]);
  });

  it.each([
    ["accepted", null, false, false, { yin: "active", yang: "passive" }],
    [null, "accepted", false, false, { yin: "passive", yang: "active" }],
    ["accepted", "pending", false, false, { yin: "active", yang: "pending" }],
    ["pending", "accepted", false, false, { yin: "pending", yang: "active" }],
    ["accepted", "accepted", false, false, { yin: "active", yang: "active" }],
    ["pending", null, false, false, { yin: "pending", yang: "passive" }],
    [null, "pending", false, false, { yin: "passive", yang: "pending" }],
    ["accepted", "accepted", true, false, { yin: "passive", yang: "passive" }],
    ["accepted", "accepted", false, true, { yin: "passive", yang: "passive" }],
  ] as const)("keeps Yin/Yang directions independent for owner=%s viewer=%s self=%s anonymous=%s", (owner, viewer, self, anonymous, expected) => {
    expect(buildYinYangConnectionViewModel({
      ownerFollowsViewer: owner,
      viewerFollowsOwner: viewer,
      self,
      anonymous,
    })).toEqual(expected);
  });
});
