import { describe, expect, it } from "vitest";
import {
  CLOUD_MEDIA_CLIENT_VERSION,
  decodePublicCloudRolloutState,
  evaluateRemoteCloudRollout,
  resolveCloudRolloutContract,
} from "@/lib/cloud-rollout";

describe("D2C.2 cloud rollout contract", () => {
  it.each([
    ["legacy", false, "ready"],
    ["d2b1", false, "ready"],
    ["d2b1", true, "ready"],
    ["d2c1", true, "ready"],
    ["legacy", true, "incompatible"],
    ["d2c1", false, "reload_required"],
  ] as const)(
    "%s schema + v2=%s resolves to %s",
    (schemaStage, v2, status) => {
      expect(resolveCloudRolloutContract({
        schemaStage,
        v2Enabled: v2 ? "true" : "false",
      }).status).toBe(status);
    },
  );

  it("blocks unknown schema and maintenance without exposing internals", () => {
    const unknown = resolveCloudRolloutContract({ schemaStage: "future" });
    const maintenance = resolveCloudRolloutContract({
      schemaStage: "d2b1",
      v2Enabled: "true",
      maintenance: "true",
    });
    expect(unknown).toMatchObject({
      status: "incompatible",
      code: "cloud_schema_unknown",
    });
    expect(maintenance.status).toBe("maintenance");
    expect(`${unknown.message}${maintenance.message}`).not.toMatch(
      /select |insert |stack|sql/i,
    );
  });

  it("requires reload when deployment epoch or minimum client changes", () => {
    const local = resolveCloudRolloutContract({
      schemaStage: "d2b1",
      v2Enabled: "true",
    });
    const remote = {
      format: "mediatracker-cloud-rollout" as const,
      version: 1 as const,
      schemaStage: "d2c1" as const,
      maintenance: false,
      deploymentEpoch: "new",
      minimumClientVersion: CLOUD_MEDIA_CLIENT_VERSION,
    };
    expect(evaluateRemoteCloudRollout(local, remote, "old")).toMatchObject({
      status: "reload_required",
      requiresReload: true,
    });
  });

  it("rejects malformed public rollout payloads", () => {
    expect(decodePublicCloudRolloutState({
      format: "mediatracker-cloud-rollout",
      version: 1,
      schemaStage: "future",
      maintenance: false,
      deploymentEpoch: "",
      minimumClientVersion: CLOUD_MEDIA_CLIENT_VERSION,
    })).toBeNull();
  });
});
