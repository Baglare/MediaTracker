import type { ConnectionState, FollowStatus, ProfileVisibility, RelationshipFacts } from "@/lib/social/types";

export function resolveConnectionState(facts: RelationshipFacts): ConnectionState {
  if (facts.self) return "self";
  if (facts.anonymous) return "anonymous";
  if (facts.viewerFollowsOwner === "pending") return "outbound_pending";
  if (facts.ownerFollowsViewer === "pending") return "inbound_pending";
  if (facts.viewerFollowsOwner === "accepted" && facts.ownerFollowsViewer === "accepted") return "mutual";
  if (facts.viewerFollowsOwner === "accepted") return "viewer_follows";
  if (facts.ownerFollowsViewer === "accepted") return "owner_follows";
  return "none";
}

export type FollowDecision = { ok: true; status: FollowStatus } | { ok: false; reason: "self" | "personal" | "blocked" | "duplicate" };

export function decideFollow(args: {
  visibility: ProfileVisibility;
  self: boolean;
  blocked: boolean;
  existing: FollowStatus | null;
}): FollowDecision {
  if (args.self) return { ok: false, reason: "self" };
  if (args.blocked) return { ok: false, reason: "blocked" };
  if (args.visibility === "personal") return { ok: false, reason: "personal" };
  if (args.existing) return { ok: false, reason: "duplicate" };
  return { ok: true, status: args.visibility === "public" ? "accepted" : "pending" };
}

export function removeRelationshipsOnBlock<T extends { followerId: string; followingId: string }>(
  relationships: T[],
  blockerId: string,
  blockedId: string
): T[] {
  return relationships.filter((relation) => !(
    (relation.followerId === blockerId && relation.followingId === blockedId) ||
    (relation.followerId === blockedId && relation.followingId === blockerId)
  ));
}
