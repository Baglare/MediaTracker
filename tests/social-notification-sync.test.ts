import { describe, expect, it } from "vitest";
import { applyNotificationCount } from "@/lib/social/notification-sync";

describe("shared notification count reconciliation", () => {
  it("decrements one read without going below zero", () => { expect(applyNotificationCount(4, { delta: -1, reason: "read" })).toBe(3); expect(applyNotificationCount(0, { delta: -1, reason: "read" })).toBe(0); });
  it("sets mark-all result to zero immediately", () => expect(applyNotificationCount(8, { unreadCount: 0, reason: "read_all" })).toBe(0));
  it("keeps new-notification increments", () => expect(applyNotificationCount(2, { delta: 1, reason: "new" })).toBe(3));
  it("requests a refetch when mutation state is uncertain", () => expect(applyNotificationCount(2, { reason: "refresh" })).toBeUndefined());
  it("prefers an authoritative server count over a delta", () => expect(applyNotificationCount(9, { unreadCount: 3, delta: -1, reason: "entity_viewed" })).toBe(3));
});
