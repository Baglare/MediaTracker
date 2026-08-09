export function assertSafeSupabaseTestTarget(
  testUrl: string,
  productionUrls?: Array<string | undefined>,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  let parsed: URL;
  try {
    parsed = new URL(testUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid_protocol");
    }
  } catch {
    throw new Error("SUPABASE_TEST_URL must be an explicitly marked HTTP(S) test project URL.");
  }
  const normalized = parsed.origin.toLowerCase();
  const stagingRef = environment.D8_STAGING_PROJECT_REF?.trim().toLowerCase();
  const productionRef = environment.D8_PRODUCTION_PROJECT_REF?.trim().toLowerCase();
  const appOrigin = (() => {
    try { return environment.NEXT_PUBLIC_SUPABASE_URL ? new URL(environment.NEXT_PUBLIC_SUPABASE_URL).origin.toLowerCase() : ""; }
    catch { return ""; }
  })();
  const explicitD8Staging = environment.D8_STAGING_CUTOVER_ENABLED === "1"
    && environment.D8_STAGING_MIGRATION_ALLOWED === "1"
    && Boolean(stagingRef && productionRef && stagingRef !== productionRef)
    && parsed.hostname.toLowerCase() === `${stagingRef}.supabase.co`
    && normalized === appOrigin;
  const resolvedProductionUrls = productionUrls ?? (explicitD8Staging
    ? [environment.SUPABASE_PRODUCTION_URL]
    : [environment.NEXT_PUBLIC_SUPABASE_URL, environment.SUPABASE_PRODUCTION_URL]);
  const productionOrigins = resolvedProductionUrls
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value).origin.toLowerCase();
      } catch {
        throw new Error("Configured production Supabase URL is invalid.");
      }
    });
  if (productionOrigins.includes(normalized)) {
    throw new Error(
      "Live integration test refused: SUPABASE_TEST_URL matches the production project.",
    );
  }
  if (explicitD8Staging) return;
  const host = parsed.hostname.toLowerCase();
  const explicitTestTarget = host === "localhost"
    || host === "127.0.0.1"
    || /(^|[.-])(test|testing|staging|dev|development|local)([.-]|$)/.test(host)
    || parsed.searchParams.get("environment") === "test";
  if (!explicitTestTarget) {
    throw new Error("SUPABASE_TEST_URL must be an explicitly marked HTTP(S) test project URL.");
  }
}
