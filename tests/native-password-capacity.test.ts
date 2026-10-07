import { it, expect, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { withNativePasswordWork, nativePassword } from '@/lib/auth/native-password';
it('rejects excess hashing work without unbounded wait and releases slots after errors',async()=>{
  let release!: () => void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  const first=withNativePasswordWork(()=>held),second=withNativePasswordWork(()=>held);
  await expect(withNativePasswordWork(async()=>undefined)).rejects.toThrow('native_auth_capacity');
  release();await Promise.all([first,second]);
  await expect(withNativePasswordWork(async()=>{throw new Error('failed');})).rejects.toThrow('failed');
  await expect(withNativePasswordWork(async()=>true)).resolves.toBe(true);
});
it('retains Better Auth hashing format and verifies after a fresh operation',async()=>{
  const hash=await nativePassword.hash('synthetic-password-only');
  expect(hash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);
  await expect(nativePassword.verify({hash,password:'synthetic-password-only'})).resolves.toBe(true);
  await expect(nativePassword.verify({hash,password:'wrong'})).resolves.toBe(false);
});
