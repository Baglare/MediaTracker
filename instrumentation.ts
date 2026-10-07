export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NEXT_PHASE === 'phase-production-build') return;
  const { getBackendProvider } = await import('./lib/backend/provider');
  if (getBackendProvider() !== 'native') return;
  const { nativeDeploymentConfig } = await import('./lib/backend/deployment-config.mjs');
  const { safeDirectory } = await import('./lib/backend/filesystem-core.mjs');
  const { access, constants } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const config = nativeDeploymentConfig(process.env);
  try {
    await safeDirectory(config.storageRoot, true);
    for (const name of ['users', 'temporary-uploads']) await safeDirectory(join(config.storageRoot, name), true);
    await access(config.storageRoot, constants.R_OK | constants.W_OK | constants.X_OK);
  } catch { throw new Error('native_storage_unavailable'); }
}
