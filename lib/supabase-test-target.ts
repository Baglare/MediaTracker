export function assertSafeSupabaseTestTarget(
  testUrl: string,
  productionUrls: Array<string | undefined> = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_PRODUCTION_URL,
  ],
): void {
  let normalized: string;
  try {
    const parsed = new URL(testUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("invalid_protocol");
    }
    normalized = parsed.origin.toLowerCase();
  } catch {
    throw new Error("SUPABASE_TEST_URL must be an HTTP(S) test project URL.");
  }
  const productionOrigins = productionUrls
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
}
