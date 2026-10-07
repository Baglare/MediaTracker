export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return runSafeApiRoute("/api/health/live", "GET", async () =>
    Response.json({ status: 'alive' }, { headers: { 'Cache-Control': 'no-store' } }));
}
import { runSafeApiRoute } from '@/lib/api/safe-route';
