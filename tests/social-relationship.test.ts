import { describe, expect, it } from "vitest";
import { decideFollow, removeRelationshipsOnBlock, resolveConnectionState } from "@/lib/social/relationships";

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
});
