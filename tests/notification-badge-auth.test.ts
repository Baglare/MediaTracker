import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, loading: false },
  cleanups: [] as (() => void)[],
  snapshots: [] as (() => number)[],
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => harness.auth }));
// Exercise the external-store lifecycle without browser/GUI automation.
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, snapshot: () => number) => {
    harness.cleanups.push(subscribe(() => undefined));
    harness.snapshots.push(snapshot);
    return snapshot();
  },
}));
import { NotificationBadge } from "@/components/social/notification-badge";

function unmount() { harness.cleanups.splice(0).forEach(cleanup => cleanup()); harness.snapshots = []; }
async function settle() { await new Promise(resolve => setImmediate(resolve)); }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const surface = new EventTarget();
  Object.assign(surface, { setInterval, clearInterval });
  vi.stubGlobal("window", surface);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ unreadCount: 3 })));
  harness.auth = { user: null, loading: false };
});
afterEach(() => { unmount(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("notification badge auth-scoped polling", () => {
  it.each([false, true])("does not poll a guest/loading session (loading=%s)", async loading => {
    harness.auth = { user: loading ? { id: "owner-a" } : null, loading };
    expect(NotificationBadge()).toBeNull();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shares polling across signed-in badges and refreshes on focus and timer", async () => {
    harness.auth.user = { id: "owner-a" };
    NotificationBadge(); NotificationBadge();
    expect(fetch).toHaveBeenCalledTimes(1);
    await settle();
    expect(harness.snapshots.map(snapshot => snapshot())).toEqual([3, 3]);
    window.dispatchEvent(new Event("focus")); await settle();
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000); await settle();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("stops polling and discards an old owner's pending response on logout/switch", async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    harness.auth.user = { id: "owner-a" };
    NotificationBadge(); unmount();
    harness.auth.user = null; expect(NotificationBadge()).toBeNull(); unmount();
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    harness.auth.user = { id: "owner-b" };
    NotificationBadge(); await settle();
    expect(harness.snapshots[0]()).toBe(3);
    finish(Response.json({ unreadCount: 99 })); await settle();
    expect(harness.snapshots[0]()).toBe(3);
    window.dispatchEvent(new Event("focus")); await settle();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("tolerates a rejected notification request and keeps authenticated polling", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    harness.auth.user = { id: "owner-a" };
    NotificationBadge(); await settle();
    expect(harness.snapshots[0]()).toBe(0);
    window.dispatchEvent(new Event("focus")); await settle();
    expect(harness.snapshots[0]()).toBe(3);
  });
  it("an old request cannot clear the new owner's in-flight request", async () => {
    let finishA!: (response: Response) => void;
    let finishB!: (response: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(() => new Promise(resolve => { finishA = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishB = resolve; }));
    harness.auth.user = { id: "owner-a" }; NotificationBadge(); unmount();
    harness.auth.user = { id: "owner-b" }; NotificationBadge();
    finishA(Response.json({ unreadCount: 99 })); await settle();
    window.dispatchEvent(new Event("focus"));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(harness.snapshots[0]()).toBe(0);
    finishB(Response.json({ unreadCount: 4 })); await settle();
    expect(harness.snapshots[0]()).toBe(4);
  });
});
