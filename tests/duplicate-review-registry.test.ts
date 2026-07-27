import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { scanDuplicateCandidates } from "@/lib/duplicate-scanner";
import {
  applyDuplicateReviewDecisions,
  duplicateReviewRegistryCodec,
  emptyDuplicateReviewRegistry,
  persistDuplicateReviewDecision,
  readDuplicateReviewRegistry,
  updateDuplicateReviewRegistry,
  writeDuplicateReviewRegistry,
} from "@/lib/duplicate-review-registry";
import { emptyMediaIdentityAliasRegistry } from "@/lib/media-identity-aliases";
import { ensureMediaIdentity } from "@/lib/media-identity";
import {
  createUserOwnerScope,
  GUEST_OWNER_SCOPE,
} from "@/lib/local-owner-scope";
import {
  buildPersonalDataKeys,
  type PersonalStorageLike,
} from "@/lib/personal-data-storage";
import type { MediaItem } from "@/lib/types";

class MemoryStorage implements PersonalStorageLike {
  values = new Map<string, string>();
  failSetKey?: string;
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (key === this.failSetKey) {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, value);
  }
  removeItem(key: string): void { this.values.delete(key); }
}

const userA = createUserOwnerScope("user-a");
const userB = createUserOwnerScope("user-b");

function media(id: string): MediaItem {
  return ensureMediaIdentity({
    id,
    title: "Same",
    type: "movie",
    status: "planning",
    coverImage: "",
    currentProgress: 0,
    totalProgress: 1,
  }).item;
}

function candidate(scope = userA) {
  return scanDuplicateCandidates(
    [media("a"), media("b")],
    emptyMediaIdentityAliasRegistry(),
    { ownerScope: scope.key },
  ).candidates[0];
}

describe("owner-scoped duplicate review registry", () => {
  it.each(["ignored", "deferred", "not-duplicate"] as const)(
    "persists and reapplies %s",
    (decision) => {
      const storage = new MemoryStorage();
      const item = candidate();
      expect(persistDuplicateReviewDecision(userA, item, decision, storage).ok).toBe(true);
      const read = readDuplicateReviewRegistry(userA, storage);
      expect(read.status).toBe("valid");
      if (read.status !== "valid") return;
      expect(applyDuplicateReviewDecisions([item], read.data)[0].decision).toBe(decision);
    },
  );

  it("keeps guest, User A and User B decisions isolated", () => {
    const storage = new MemoryStorage();
    expect(persistDuplicateReviewDecision(userA, candidate(userA), "ignored", storage).ok)
      .toBe(true);
    expect(readDuplicateReviewRegistry(userA, storage).status).toBe("valid");
    expect(readDuplicateReviewRegistry(userB, storage).status).toBe("missing");
    expect(readDuplicateReviewRegistry(GUEST_OWNER_SCOPE, storage).status).toBe("missing");
    expect(buildPersonalDataKeys("duplicateReviewDecisions", userA).current)
      .not.toBe(buildPersonalDataKeys("duplicateReviewDecisions", userB).current);
  });

  it("keeps verified current/backup, removes temp and survives reload", () => {
    const storage = new MemoryStorage();
    const item = candidate();
    persistDuplicateReviewDecision(userA, item, "deferred", storage);
    persistDuplicateReviewDecision(userA, item, "ignored", storage);
    const keys = buildPersonalDataKeys("duplicateReviewDecisions", userA);
    expect(storage.getItem(keys.current)).toContain("ignored");
    expect(storage.getItem(keys.backup)).toContain("deferred");
    expect(storage.getItem(keys.temp)).toBeNull();
    expect(readDuplicateReviewRegistry(userA, storage)).toMatchObject({
      status: "valid",
      data: { decisions: [{ decision: "ignored" }] },
    });
  });

  it("quarantines an invalid registry and refuses to overwrite it", () => {
    const storage = new MemoryStorage();
    const keys = buildPersonalDataKeys("duplicateReviewDecisions", userA);
    storage.setItem(keys.current, "{broken");
    const read = readDuplicateReviewRegistry(userA, storage);
    expect(read.status).toBe("corrupt");
    expect(read.status === "corrupt" && read.quarantineKey).toBeTruthy();
    expect(persistDuplicateReviewDecision(userA, candidate(), "ignored", storage)).toMatchObject({
      ok: false,
      code: "verification_failed",
    });
    expect(storage.getItem(keys.current)).toBe("{broken");
  });

  it("preserves current when a safe-write temp operation fails", () => {
    const storage = new MemoryStorage();
    const item = candidate();
    persistDuplicateReviewDecision(userA, item, "deferred", storage);
    const keys = buildPersonalDataKeys("duplicateReviewDecisions", userA);
    const current = storage.getItem(keys.current);
    storage.failSetKey = keys.temp;
    expect(persistDuplicateReviewDecision(userA, item, "ignored", storage)).toMatchObject({
      ok: false,
      code: "quota_exceeded",
    });
    expect(storage.getItem(keys.current)).toBe(current);
  });

  it("rejects foreign-owner envelopes and invalid decision records", () => {
    const storage = new MemoryStorage();
    writeDuplicateReviewRegistry(userA, updateDuplicateReviewRegistry(
      emptyDuplicateReviewRegistry(),
      candidate(),
      "ignored",
    ), storage);
    const keysA = buildPersonalDataKeys("duplicateReviewDecisions", userA);
    const keysB = buildPersonalDataKeys("duplicateReviewDecisions", userB);
    storage.setItem(keysB.current, storage.getItem(keysA.current)!);
    expect(readDuplicateReviewRegistry(userB, storage).status).toBe("owner_mismatch");
    expect(duplicateReviewRegistryCodec({
      version: 1,
      decisions: [{
        candidateFingerprint: "title-only",
        decision: "merge",
        scanVersion: 1,
        recordIds: ["a"],
        evidenceFingerprint: "bad",
        decidedAt: "not-a-date",
      }],
    }).ok).toBe(false);
  });

  it("does not apply a stale decision after evidence or record membership changes", () => {
    const item = candidate();
    const registry = updateDuplicateReviewRegistry(
      emptyDuplicateReviewRegistry(),
      item,
      "not-duplicate",
      "2026-07-28T00:00:00.000Z",
    );
    expect(applyDuplicateReviewDecisions([{
      ...item,
      evidenceFingerprint: "ev:v1:00000000",
    }], registry)[0].decision).toBe("open");
    expect(applyDuplicateReviewDecisions([{
      ...item,
      recordIds: ["a", "c"],
    }], registry)[0].decision).toBe("open");
    expect(applyDuplicateReviewDecisions([], registry)).toEqual([]);
  });

  it("stores fingerprints and record IDs but no media content or personal notes", () => {
    const registry = updateDuplicateReviewRegistry(
      emptyDuplicateReviewRegistry(),
      candidate(),
      "ignored",
    );
    const raw = JSON.stringify(registry);
    expect(raw).not.toMatch(/personalNotes|overview|providerPayload|Same/);
  });
});

describe("duplicate review UI contracts", () => {
  it("wires the review panel into Settings with owner scope", () => {
    const settings = readFileSync(
      "features/settings/components/settings-feature.tsx",
      "utf8",
    );
    expect(settings).toMatch(/DuplicateReviewPanel[\s\S]*ownerScope=\{ownerScope\}/);
  });

  it("shows counts, evidence and safe decisions without merge/delete actions", () => {
    const panel = readFileSync("components/duplicate-review-panel.tsx", "utf8");
    expect(panel).toMatch(/Kesin[\s\S]*Güçlü[\s\S]*Olası/);
    expect(panel).toContain("Eşleşme kanıtları");
    expect(panel).toContain("Şimdilik ertele");
    expect(panel).toContain("Aynı medya değil");
    expect(panel).toContain("Yok say");
    expect(panel).not.toContain(">Birleştir<");
    expect(panel).not.toContain(">Sil<");
    expect(panel).not.toMatch(/personalNotes|overview|providerPayload|ownerScope\.key/);
  });

  it("masks owner transitions and rejects stale scan generations", () => {
    const hook = readFileSync("hooks/use-duplicate-review.ts", "utf8");
    expect(hook).toMatch(/setReviews\(\[\]\)|setHydratedOwnerKey\(null\)/);
    expect(hook).toMatch(/isCurrentOwnerGeneration|isHydratedOwnerVisible/);
    expect(hook).not.toMatch(/fetch\(|localStorage\./);
  });
});
