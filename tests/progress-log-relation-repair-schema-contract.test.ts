import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "20260726120000_progress_log_relation_repair.sql";
const migration = readFileSync(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  "utf8",
).toLowerCase();
const preflight = readFileSync(
  new URL(
    "../supabase/d2b0_progress_log_relation_repair_preflight.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const verification = readFileSync(
  new URL(
    "../supabase/d2b0_progress_log_relation_repair_post_migration.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const d2b1 = readFileSync(
  new URL(
    "../supabase/migrations/20260727120000_cloud_media_schema_v2_additive.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

type FixtureLog = {
  id: string;
  userId: string;
  mediaId: string | null;
  detachedMediaId: string | null;
  detachedAt: string | null;
  title: string;
  type: string;
  action: string;
  amount: number;
  unit: string;
  previousProgress: number;
  newProgress: number;
  createdAt: string;
};

function repairFixture(
  logs: FixtureLog[],
  media: Array<{ id: string; userId: string }>,
  now: string,
): FixtureLog[] {
  return logs.map((log) => {
    const hasSameOwnerTarget = log.mediaId === null || media.some(
      (item) => item.id === log.mediaId && item.userId === log.userId,
    );
    if (
      log.mediaId === null
      || hasSameOwnerTarget
      || log.detachedMediaId !== null
      || log.detachedAt !== null
    ) return log;
    return {
      ...log,
      detachedMediaId: log.mediaId,
      detachedAt: now,
      mediaId: null,
    };
  });
}

function contentSnapshot(log: FixtureLog) {
  return {
    id: log.id,
    userId: log.userId,
    title: log.title,
    type: log.type,
    action: log.action,
    amount: log.amount,
    unit: log.unit,
    previousProgress: log.previousProgress,
    newProgress: log.newProgress,
    createdAt: log.createdAt,
  };
}

describe("D2B.0 progress relation repair SQL contract (static, not live PostgreSQL)", () => {
  it("runs immediately before D2B.1", () => {
    const migrations = readdirSync(
      new URL("../supabase/migrations/", import.meta.url),
    ).sort();
    expect(migrations).toContain(migrationName);
    expect(migrations.indexOf(migrationName)).toBeLessThan(
      migrations.indexOf("20260727120000_cloud_media_schema_v2_additive.sql"),
    );
  });

  it("adds only nullable detached relation history columns", () => {
    expect(migration).toContain("add column detached_media_id text");
    expect(migration).toContain("add column detached_at timestamptz");
    expect(migration).not.toMatch(/detached_media_id\s+text\s+not null/);
    expect(migration).not.toMatch(/detached_at\s+timestamptz\s+not null/);
  });

  it("detaches only relations without a same-owner media target", () => {
    expect(migration).toContain("where p.media_id is not null");
    expect(migration).toContain("p.detached_media_id is null");
    expect(migration).toContain("p.detached_at is null");
    expect(migration).toContain(
      "where m.user_id=p.user_id and m.id=p.media_id",
    );
    expect(migration).toContain("detached_media_id=p.media_id");
    expect(migration).toContain("detached_at=statement_timestamp()");
    expect(migration).toContain("media_id=null");
  });

  it("preserves log rows and non-relation content", () => {
    const updateStart = migration.indexOf("update public.progress_logs p");
    const update = migration.slice(
      updateStart,
      migration.indexOf("where p.media_id is not null", updateStart),
    );
    for (const field of [
      "id",
      "user_id",
      "media_title",
      "media_type",
      "action",
      "amount",
      "unit",
      "previous_progress",
      "new_progress",
      "created_at",
    ]) {
      expect(update).not.toMatch(new RegExp(`\\b${field}\\s*=`));
    }
    expect(migration).not.toMatch(/^\s*(?:delete\s+from|truncate)\b/im);
    expect(migration).toContain("v_after_total<>v_before_total");
    expect(migration).toContain("v_updated<>v_before_invalid");
  });

  it("characterizes orphan, cross-owner, valid and idempotent repair", () => {
    const now = "2026-07-26T12:00:00.000Z";
    const base = {
      detachedMediaId: null,
      detachedAt: null,
      title: "Snapshot title",
      type: "movie",
      action: "progress",
      amount: 1,
      unit: "episode",
      previousProgress: 1,
      newProgress: 2,
      createdAt: "2026-07-20T12:00:00.000Z",
    };
    const logs: FixtureLog[] = [
      { ...base, id: "orphan", userId: "a", mediaId: "missing" },
      { ...base, id: "cross-owner", userId: "a", mediaId: "owned-by-b" },
      { ...base, id: "valid", userId: "a", mediaId: "owned-by-a" },
    ];
    const media = [
      { id: "owned-by-a", userId: "a" },
      { id: "owned-by-b", userId: "b" },
    ];
    const repaired = repairFixture(logs, media, now);
    expect(repaired).toHaveLength(logs.length);
    expect(repaired[0]).toMatchObject({
      mediaId: null,
      detachedMediaId: "missing",
      detachedAt: now,
    });
    expect(repaired[1]).toMatchObject({
      mediaId: null,
      detachedMediaId: "owned-by-b",
      detachedAt: now,
    });
    expect(repaired[2]).toEqual(logs[2]);
    expect(repaired.map(contentSnapshot)).toEqual(logs.map(contentSnapshot));
    expect(repairFixture(repaired, media, "later")).toEqual(repaired);
  });

  it("fails fast and verifies before/after relation counts", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).toContain("d2b0_target_columns_already_exist");
    expect(migration).toContain("d2b0_repair_count_mismatch");
    expect(migration).toContain("d2b0_progress_log_count_changed");
    expect(migration).toContain("d2b0_invalid_owner_relation_remaining");
    expect(migration).toContain("v_after_invalid<>0");
  });

  it("provides mutation-free preflight and post-verification scripts", () => {
    for (const sql of [preflight, verification]) {
      expect(sql.trimStart().startsWith("begin transaction read only;")).toBe(
        true,
      );
      expect(sql.trimEnd().endsWith("rollback;")).toBe(true);
      expect(sql).not.toMatch(
        /^\s*(?:insert|update|delete|alter|create|drop|truncate)\b/im,
      );
    }
    expect(preflight).toContain("relation_repair_candidate_count");
    expect(verification).toContain("d2b0_invalid_owner_relation_remaining");
    expect(verification).toContain("detached_log_count");
  });

  it("leaves D2B.1 owner-aware FK validation ready to succeed", () => {
    expect(d2b1).toContain("d2b1_cross_owner_progress_relation");
    expect(d2b1).toContain(
      "foreign key (user_id,media_id)\n    references public.media_items(user_id,id)",
    );
    expect(d2b1).toContain(
      "validate constraint progress_logs_owner_media_v2_fkey",
    );
  });
});
