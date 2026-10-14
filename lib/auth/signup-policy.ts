// Explicit release admission. Missing configuration keeps public registration closed.
export function nativeSignupEnabled(env: Record<string, string | undefined>) {
  return env.NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED === 'true';
}
