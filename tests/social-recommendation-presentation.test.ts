import { describe, expect, it } from "vitest";
import { recommendationCardMode, recommendationEventLabel, recommendationProgressPresentation, recommendationResponsePresentation, recipientRelationshipLabel, recipientSelectionMode } from "@/lib/social/recommendation-presentation";
import type { SocialPersonSummary } from "@/lib/social/types";

const person = (viewerFollowsOwner: "accepted" | "pending" | null, ownerFollowsViewer: "accepted" | "pending" | null): SocialPersonSummary => ({
  id: "11111111-1111-4111-8111-111111111111", username: "deniz", displayName: "Deniz", visibilityMode: "public", connectionColor: "violet",
  relationship: { anonymous: false, self: false, viewerFollowsOwner, ownerFollowsViewer, state: "none", ownerColor: "violet", viewerColor: "neutral" },
});

describe("recommendation status presentation", () => {
  it.each([
    ["pending", "Yanıt bekliyor", "amber", "clock"], ["deferred", "Sonraya bırakıldı", "sky", "pause"], ["accepted", "Kabul edildi", "emerald", "check"], ["rejected", "Reddedildi", "rose", "x"], ["withdrawn", "Geri çekildi", "zinc", "undo"],
  ])("maps response %s", (value, label, tone, icon) => expect(recommendationResponsePresentation(value)).toEqual({ label, tone, icon }));
  it.each([
    ["none", "Henüz kütüphaneye bağlanmadı", "zinc", "clock"], ["linked", "Kütüphaneye eklendi", "sky", "link"], ["started", "Başlandı", "violet", "play"], ["completed", "Tamamlandı", "emerald", "flag"],
  ])("maps progress %s", (value, label, tone, icon) => expect(recommendationProgressPresentation(value)).toEqual({ label, tone, icon }));
  it("uses a safe unknown fallback", () => { expect(recommendationResponsePresentation("future").label).toBe("Durum bilinmiyor"); expect(recommendationProgressPresentation(null).icon).toBe("help"); expect(recommendationEventLabel("future")).toBe("Bilinmeyen durum"); });
  it("chooses full, medium and compact card modes", () => { expect(recommendationCardMode("pending")).toBe("full"); expect(recommendationCardMode("deferred")).toBe("medium"); for (const state of ["accepted", "rejected", "withdrawn"] as const) expect(recommendationCardMode(state)).toBe("compact"); });
});

describe("recommendation recipient selection", () => {
  it("switches from search controls to the selected card", () => { const selected = person("accepted", "accepted"); expect(recipientSelectionMode()).toBe("search"); expect(recipientSelectionMode(selected)).toBe("selected"); });
  it.each([
    ["accepted", "accepted", "Karşılıklı"], ["accepted", null, "Takip ediyorsun"], [null, "accepted", "Seni takip ediyor"], [null, null, "Bağlantı yok"],
  ] as const)("presents relationship %s/%s", (viewer, owner, label) => expect(recipientRelationshipLabel(person(viewer, owner))).toBe(label));
});
