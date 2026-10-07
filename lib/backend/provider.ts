export type BackendProvider = "supabase" | "native";

export function resolveBackendProvider(value: string | undefined, production = false): BackendProvider {
  if (value === "supabase" || value === "native") return value;
  if (value === undefined && !production) return "supabase";
  throw new Error("backend_configuration_invalid");
}

export function getBackendProvider(): BackendProvider {
  const provider = resolveBackendProvider(
    typeof window === "undefined" ? process.env.BACKEND_PROVIDER : process.env.NEXT_PUBLIC_BACKEND_PROVIDER,
    process.env.NODE_ENV === "production",
  );
  if (typeof window === "undefined" && process.env.NEXT_PUBLIC_BACKEND_PROVIDER !== undefined
    && process.env.NEXT_PUBLIC_BACKEND_PROVIDER !== provider) throw new Error("backend_configuration_invalid");
  return provider;
}
