export const applicationRoot: string;
export const defaultD8EnvFile: string;
export function resolveD8EnvFile(args?: string[], env?: Record<string, string | undefined>): string;
export function loadD8Environment(options?: {
  args?: string[];
  env?: Record<string, string | undefined>;
  envFile?: string;
}): Record<string, string | undefined>;
