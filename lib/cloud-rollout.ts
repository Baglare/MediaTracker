export const CLOUD_MEDIA_CLIENT_VERSION = "d2c2" as const;

export type CloudMediaAdapter = "legacy" | "v2";
export type CloudMediaSchemaStage = "legacy" | "d2b1" | "d2c1" | "unknown";
export type CloudRolloutStatus =
  | "ready"
  | "maintenance"
  | "reload_required"
  | "incompatible"
  | "verification_unavailable";

export interface CloudRolloutContract {
  adapter: CloudMediaAdapter;
  schemaStage: CloudMediaSchemaStage;
  status: CloudRolloutStatus;
  code: string | null;
  message: string | null;
  requiresReload: boolean;
}

export interface PublicCloudRolloutState {
  format: "mediatracker-cloud-rollout";
  version: 1;
  schemaStage: CloudMediaSchemaStage;
  maintenance: boolean;
  deploymentEpoch: string;
  minimumClientVersion: string;
}

function schemaStage(value: string | undefined): CloudMediaSchemaStage {
  return value === "legacy" || value === "d2b1" || value === "d2c1"
    ? value
    : "unknown";
}

export function resolveCloudRolloutContract(input: {
  v2Enabled?: string;
  schemaStage?: string;
  maintenance?: string;
} = {}): CloudRolloutContract {
  const adapter: CloudMediaAdapter = input.v2Enabled === "true" ? "v2" : "legacy";
  // Backward-compatible local default. Production runbook requires the stage
  // variable to be set explicitly before cutover.
  const stage = input.schemaStage === undefined
    ? (adapter === "v2" ? "d2b1" : "legacy")
    : schemaStage(input.schemaStage);

  if (input.maintenance === "true") {
    return {
      adapter,
      schemaStage: stage,
      status: "maintenance",
      code: "cloud_maintenance",
      message: "Cloud medya bakımı sürüyor. İşlemler gönderilmedi; sayfayı yenilemeden bekleyebilirsin.",
      requiresReload: false,
    };
  }
  if (stage === "unknown") {
    return {
      adapter,
      schemaStage: stage,
      status: "incompatible",
      code: "cloud_schema_unknown",
      message: "Cloud şema sürümü doğrulanamadı. Güvenlik için medya senkronizasyonu durduruldu.",
      requiresReload: false,
    };
  }
  if (stage === "legacy" && adapter === "v2") {
    return {
      adapter,
      schemaStage: stage,
      status: "incompatible",
      code: "v2_client_requires_additive_schema",
      message: "Cloud V2 istemcisi mevcut şemayla uyumlu değil. Senkronizasyon durduruldu.",
      requiresReload: false,
    };
  }
  if (stage === "d2c1" && adapter === "legacy") {
    return {
      adapter,
      schemaStage: stage,
      status: "reload_required",
      code: "legacy_client_blocked_after_pk_cutover",
      message: "Cloud şeması güncellendi. Güvenli senkronizasyon için uygulamayı yenilemelisin.",
      requiresReload: true,
    };
  }
  return {
    adapter,
    schemaStage: stage,
    status: "ready",
    code: null,
    message: null,
    requiresReload: false,
  };
}

export function getCloudRolloutContract(): CloudRolloutContract {
  return resolveCloudRolloutContract({
    v2Enabled: process.env.NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED,
    schemaStage: process.env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE,
    maintenance: process.env.NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE,
  });
}

export function buildPublicCloudRolloutState(): PublicCloudRolloutState {
  return {
    format: "mediatracker-cloud-rollout",
    version: 1,
    schemaStage: schemaStage(process.env.NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE),
    maintenance: process.env.NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE === "true",
    deploymentEpoch: process.env.NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH ?? "",
    minimumClientVersion:
      process.env.NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION
      ?? CLOUD_MEDIA_CLIENT_VERSION,
  };
}

export function decodePublicCloudRolloutState(
  value: unknown,
): PublicCloudRolloutState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const stage = schemaStage(
    typeof input.schemaStage === "string" ? input.schemaStage : undefined,
  );
  if (
    input.format !== "mediatracker-cloud-rollout"
    || input.version !== 1
    || stage === "unknown"
    || typeof input.maintenance !== "boolean"
    || typeof input.deploymentEpoch !== "string"
    || typeof input.minimumClientVersion !== "string"
  ) return null;
  return {
    format: input.format,
    version: input.version,
    schemaStage: stage,
    maintenance: input.maintenance,
    deploymentEpoch: input.deploymentEpoch,
    minimumClientVersion: input.minimumClientVersion,
  };
}

export function evaluateRemoteCloudRollout(
  local: CloudRolloutContract,
  remote: PublicCloudRolloutState,
  currentEpoch: string,
): CloudRolloutContract {
  if (remote.maintenance) {
    return {
      ...local,
      schemaStage: remote.schemaStage,
      status: "maintenance",
      code: "cloud_maintenance",
      message: "Cloud medya bakımı sürüyor. Bekleyen işlemler korunuyor ve gönderilmiyor.",
      requiresReload: false,
    };
  }
  if (
    remote.minimumClientVersion !== CLOUD_MEDIA_CLIENT_VERSION
    || (currentEpoch !== "" && remote.deploymentEpoch !== currentEpoch)
  ) {
    return {
      ...local,
      schemaStage: remote.schemaStage,
      status: "reload_required",
      code: "cloud_client_reload_required",
      message: "Yeni cloud sürümü hazır. Devam etmek için uygulamayı yenilemelisin.",
      requiresReload: true,
    };
  }
  return resolveCloudRolloutContract({
    v2Enabled: local.adapter === "v2" ? "true" : "false",
    schemaStage: remote.schemaStage,
  });
}
