export function resolveSafeStagingTarget(
  env?: Record<string, string | undefined>,
  options?: { requireMigrationPermission?: boolean },
): { databaseUrl: URL };
export function runReadOnlySql(relativeFile: string, env?: Record<string, string | undefined>): Promise<void>;
