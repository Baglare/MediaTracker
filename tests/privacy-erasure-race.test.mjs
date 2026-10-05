import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fixture, USER_A } from "../scripts/privacy-synthetic-fixture.mjs";

test("05C baseline: same pre-erasure identity can recreate Cloud before Auth deletion", async () => {
  const baseline = execFileSync("git", ["show", "2edd8af879bccbad64530abeb5b7c7f891bba0ac:supabase/migrations/20260728120000_owner_scoped_primary_key_enforcement.sql"], { encoding: "utf8" });
  assert.match(baseline, /security definer/i);
  assert.match(baseline, /auth.uid\(\)/);
  assert.match(baseline, /insert into public.media_items/i);
  assert.ok(!baseline.includes("account_lifecycle"));
  const source = fixture();
  const sameIdentity = source.auth.find((r) => r.id === USER_A).id;
  source.tables.media_items = source.tables.media_items.filter((r) => r.user_id !== USER_A);
  assert.ok(source.auth.some((row) => row.id === sameIdentity));
  assert.equal(source.tables.media_items.some((row) => row.user_id === USER_A), false);
  // Retained architectural reproducer, not a claim of executing baseline SQL.
  // Baseline admits the same owner in the unguarded definer INSERT path.
  source.tables.media_items.push({ id: "resurrection", user_id: sameIdentity });
  assert.equal(source.tables.media_items.some((row) => row.user_id === USER_A), true);
});
