import { describe, expect, it } from "vitest";
import { emptyMediaIdentityAliasRegistry } from "@/lib/media-identity-aliases";
import { emptyMediaRecordRedirectRegistry } from "@/lib/media-record-redirects";
import {
  computePortableBackupChecksum,
  createPortableBackup,
  decodePortableBackupForImport,
  inspectPortableBackupText,
  serializePortableBackup,
  type PortableBackupV2,
} from "@/lib/portable-backup";
import type { Goal } from "@/features/goals/domain/types";

const goal: Goal = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Ayda iki film",
  origin: "suggested",
  scope: { kind: "library" },
  metric: { kind: "completed_media", targetValue: 2 },
  schedule: { kind: "monthly", startsOn: "2026-08-01", timeZone: "Europe/Istanbul" },
  lifecycle: "archived",
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-02T08:00:00.000Z",
};

async function v3(goals: Goal[] = [goal]) {
  return createPortableBackup({
    ownerType: "authenticated",
    mediaItems: [], progressLogs: [], goals,
    identityAliases: emptyMediaIdentityAliasRegistry(),
    recordRedirects: emptyMediaRecordRedirectRegistry(),
    recommendationLinks: [],
  }, { exportedAt: "2026-08-03T08:00:00.000Z", includePersonalNotes: false });
}

describe("Portable Backup V3 Goals", () => {
  it("exports Goal definitions but no evaluation/cloud metadata", async () => {
    const created = await v3();
    expect(created.backup.manifest.version).toBe(3);
    expect(created.backup.data.goals).toEqual([goal]);
    expect(created.serialized).not.toContain("progressPercent");
    expect(created.serialized).not.toContain("cloudRevision");
    expect(created.serialized).not.toContain("goalCloudQueue");
  });

  it("keeps V2 import compatibility", async () => {
    const created = await v3([]);
    const backup = structuredClone(created.backup) as PortableBackupV2;
    backup.manifest.version = 2;
    backup.manifest.domains = backup.manifest.domains.filter((domain) => domain !== "goals");
    delete backup.manifest.schemas.goal;
    delete (backup.manifest.counts as Partial<typeof backup.manifest.counts>).goals;
    delete backup.data.goals;
    backup.manifest.checksum.value = await computePortableBackupChecksum(backup.manifest, backup.data);
    const decoded = await decodePortableBackupForImport(serializePortableBackup(backup));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.manifest.version).toBe(2);
  });

  it("salvages healthy Goals and reports malformed entries", async () => {
    const created = await v3();
    const backup = structuredClone(created.backup);
    backup.data.goals!.push({ ...goal, id: "not-a-uuid" } as Goal);
    backup.manifest.counts.goals = 2;
    backup.manifest.checksum.value = await computePortableBackupChecksum(backup.manifest, backup.data);
    const text = serializePortableBackup(backup);
    const inspection = await inspectPortableBackupText(text);
    expect(inspection.status).toBe("valid");
    expect(inspection.issues.some((issue) => issue.code === "GOAL_CODEC_INVALID")).toBe(true);
    const decoded = await decodePortableBackupForImport(text);
    expect(decoded.ok && decoded.data.goals).toEqual([goal]);
  });
});
