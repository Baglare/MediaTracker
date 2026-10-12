import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/cloud/rollout/route";
import {
  CLOUD_MEDIA_CLIENT_VERSION,
  decodePublicCloudRolloutState,
  evaluateRemoteCloudRollout,
  resolveCloudRolloutContract,
} from "@/lib/cloud-rollout";

afterEach(() => vi.unstubAllEnvs());

describe("D2C.2 cloud rollout contract", () => {
  it("reads current runtime values on every no-store request", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE", "d2c1");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE", "false");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH", "v1-012345abcdef");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION", "d2c2");
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(await response.json()).toEqual({
      format: "mediatracker-cloud-rollout", version: 1, schemaStage: "d2c1",
      maintenance: false, deploymentEpoch: "v1-012345abcdef", minimumClientVersion: "d2c2",
    });
    vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE", "true");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH", "v1-abcdef012345");
    vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION", "future-client");
    expect(await (await GET()).json()).toMatchObject({
      maintenance: true, deploymentEpoch: "v1-abcdef012345", minimumClientVersion: "future-client",
    });
    vi.stubEnv("NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE", undefined);
    expect(await (await GET()).json()).toMatchObject({ schemaStage: "unknown" });
  });
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
