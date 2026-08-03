export type GoalCloudSchemaStage = "absent" | "v1" | "unknown";

export interface GoalCloudRolloutContract {
  enabled: boolean;
  schemaStage: GoalCloudSchemaStage;
  status: "disabled" | "ready" | "incompatible";
  code: string | null;
  message: string | null;
}

export function resolveGoalCloudRolloutContract(input: {
  enabled?: string;
  schemaStage?: string;
} = {}): GoalCloudRolloutContract {
  const enabled = input.enabled === "true";
  const schemaStage: GoalCloudSchemaStage = input.schemaStage === "absent" || input.schemaStage === "v1"
    ? input.schemaStage
    : "unknown";
  if (!enabled) return { enabled: false, schemaStage, status: "disabled", code: null, message: null };
  if (schemaStage !== "v1") {
    return {
      enabled: true,
      schemaStage,
      status: "incompatible",
      code: "goal_schema_unavailable",
      message: "Hedef senkronizasyonu durduruldu. Yerel hedeflerin korunuyor.",
    };
  }
  return { enabled: true, schemaStage, status: "ready", code: null, message: null };
}

export function getGoalCloudRolloutContract(): GoalCloudRolloutContract {
  return resolveGoalCloudRolloutContract({
    enabled: process.env.NEXT_PUBLIC_CLOUD_GOALS_V1_ENABLED,
    schemaStage: process.env.NEXT_PUBLIC_CLOUD_GOALS_SCHEMA_STAGE,
  });
}
