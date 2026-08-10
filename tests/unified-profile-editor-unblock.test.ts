import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BlockedAccountsSection, unblockSocialAccount } from "@/components/profile/unified-profile-editor";

describe("UnifiedProfileEditor blocked account management", () => {
  it("does not render the section when there are no blocked accounts", () => {
    const html = renderToStaticMarkup(createElement(BlockedAccountsSection, {
      accounts: [],
      unblockingId: null,
      onUnblock: vi.fn(),
    }));

    expect(html).toBe("");
  });

  it("renders only the safe account label and unblock control", () => {
    const accounts = [{
      id: "internal-user-id",
      username: "ornek",
      displayName: "Örnek Kullanıcı",
      email: "private@example.test",
      internalRole: "private-role",
    }];
    const html = renderToStaticMarkup(createElement(BlockedAccountsSection, {
      accounts,
      unblockingId: null,
      onUnblock: vi.fn(),
    }));

    expect(html).toContain("Engellenen hesaplar");
    expect(html).toContain("Örnek Kullanıcı");
    expect(html).toContain("@ornek");
    expect(html).toContain("Engeli kaldır");
    expect(html).not.toContain("internal-user-id");
    expect(html).not.toContain("private@example.test");
    expect(html).not.toContain("private-role");
  });

  it("posts the unblock action and refreshes without restoring follow state", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const refreshed = { configured: true, authenticated: true, modules: [], favorites: [], current: [], sharedNotes: [], blockedAccounts: [] };
    const refresh = vi.fn(async () => refreshed);

    await expect(unblockSocialAccount("target-id", refresh, fetchImpl as typeof fetch)).resolves.toBe(refreshed);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith("/api/social/relationships", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unblock", targetId: "target-id" }),
    });
    expect(fetchImpl.mock.calls[0]?.[1]?.body).not.toContain("follow");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("maps backend failure details to a stable safe error and does not refresh", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: "raw sql failure detail" }), { status: 500 }));
    const refresh = vi.fn();

    await expect(unblockSocialAccount("target-id", refresh, fetchImpl as typeof fetch)).rejects.toThrow("Engel kaldırılamadı. Lütfen tekrar dene.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
