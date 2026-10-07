import { nativeDeploymentConfig } from '@/lib/backend/deployment-config.mjs';
import { nativeDatabaseReady } from '@/lib/backend/transaction';
import { runSafeApiRoute } from '@/lib/api/safe-route';
import { safeDirectory } from '@/lib/backend/filesystem-core.mjs';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import migrations from '@/lib/backend/native-migration-state.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return runSafeApiRoute("/api/health/ready", "GET", async () => {
  let ready = false;
  try {
    const config = nativeDeploymentConfig(process.env);
    await safeDirectory(config.storageRoot);
    await access(config.storageRoot, constants.R_OK | constants.W_OK | constants.X_OK);
    for(const name of ['users','temporary-uploads']) {
      const directory=join(config.storageRoot,name);await safeDirectory(directory);
      await access(directory,constants.R_OK | constants.W_OK | constants.X_OK);
    }
    ready = await nativeDatabaseReady(migrations);
  } catch { /* Public diagnostics contain only status. */ }
  return Response.json({ status: ready ? 'ready' : 'unavailable' },
    { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  });
}
