import { getBackendProvider } from '@/lib/backend/provider';
import { deliverNativeAsset } from '@/lib/backend/filesystem-assets';
import { runSafeApiRoute } from '@/lib/api/safe-route';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  return runSafeApiRoute("/api/backend/assets", "GET",async()=>{
    if(getBackendProvider()!=='native')return new Response(null,{status:404});
    try {
      const result=await deliverNativeAsset(new URL(request.url).searchParams.get('key')??'');
      return new Response(new Uint8Array(result.bytes),{headers:{'Content-Type':result.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store','Content-Length':String(result.bytes.length)}});
    } catch {return new Response(null,{status:404,headers:{'Cache-Control':'private, no-store'}});}
  });
}
