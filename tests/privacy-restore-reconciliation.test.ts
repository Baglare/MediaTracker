import { describe, expect, it } from "vitest";
import { fixture, USER_A, USER_B } from "../scripts/privacy-synthetic-fixture.mjs";
import { runErasure, syntheticAdapter, verifyErasure } from "../scripts/privacy-account-model.mjs";

describe("offline restore erasure reconciliation", () => {
  it("detects resurrection from an older backup, reconciles it and preserves the other account", async () => {
    const backup = fixture();
    const live = syntheticAdapter(structuredClone(backup));
    const options = { execute: true, confirmation: `ERASE SYNTHETIC ${USER_A}`, acceptParticipantLoss: true };
    expect((await runErasure(live, USER_A, options)).completed).toBe(true);
    expect(verifyErasure(await live.inspect(), USER_A).applicationControlledAbsent).toBe(true);

    // The independent erasure register survives restoring this older DB snapshot.
    const erasedAccounts = [USER_A];
    const restored = syntheticAdapter(structuredClone(backup));
    const bBefore = (await restored.inspect()).tables.media_items.filter((row: { user_id: string }) => row.user_id === USER_B);
    for (const user of erasedAccounts) {
      expect(verifyErasure(await restored.inspect(), user).applicationControlledAbsent).toBe(false);
      expect((await runErasure(restored, user, options)).completed).toBe(true);
      expect(verifyErasure(await restored.inspect(), user).applicationControlledAbsent).toBe(true);
    }
    expect((await restored.inspect()).tables.media_items.filter((row: { user_id: string }) => row.user_id === USER_B)).toEqual(bBefore);
    expect((await runErasure(restored, USER_A, options)).completed).toBe(true);
  });

  it("keeps release blocked when reconciliation fails or an unclassified residual exists", async () => {
    const restored = syntheticAdapter(fixture(), { failAt: "application-cleanup" });
    const options = {
      execute: true, confirmation: `ERASE SYNTHETIC ${USER_A}`, acceptParticipantLoss: true,
    };
    const result = await runErasure(restored, USER_A, options);
    expect(result.completed).toBe(false);
    expect(verifyErasure(await restored.inspect(), USER_A).applicationControlledAbsent).toBe(false);
    const unknown = fixture();
    const tables = unknown.tables as Record<string, unknown[]>;
    tables.embedding_cache.push({ id: "unknown-restored-reference", content: USER_A });
    expect(verifyErasure(unknown, USER_A).applicationControlledAbsent).toBe(false);
  });
});
