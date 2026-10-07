import { expect, it, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks=vi.hoisted(()=>({create:vi.fn(),on:vi.fn()}));
vi.mock('pg',()=>({Pool:class {constructor(options:unknown){mocks.create(options);} on=mocks.on;}}));
import { getNativePool } from '@/lib/backend/postgres';
beforeEach(()=>{
  vi.stubEnv('BACKEND_PROVIDER','native');vi.stubEnv('DATABASE_URL','postgresql://mt_runtime:synthetic@127.0.0.1/test');
  vi.stubEnv('DATABASE_SSL_MODE','disable');vi.stubEnv('BETTER_AUTH_URL','http://localhost:3000');vi.stubEnv('BETTER_AUTH_SECRET','s'.repeat(40));
});
it('reuses one bounded process pool and verifies actual role before handing out connections',async()=>{
  expect(getNativePool()).toBe(getNativePool());expect(mocks.create).toHaveBeenCalledTimes(1);
  const options=mocks.create.mock.calls[0][0];
  expect(options).toMatchObject({max:2,connectionTimeoutMillis:3000,statement_timeout:5000,query_timeout:6000});
  expect(mocks.on).toHaveBeenCalledWith('error',expect.any(Function));
  await expect(options.onConnect({query:async()=>({rows:[{safe:true}]})})).resolves.toBeUndefined();
  for(const query of [async()=>({rows:[{safe:false}]}),async()=>{throw new Error('password personal SQL');}]) {
    await expect(options.onConnect({query})).rejects.toThrow(/^native_database_role_invalid$/);
  }
  vi.stubEnv('BACKEND_PROVIDER','supabase');expect(()=>getNativePool()).toThrow('native_backend_inactive');vi.unstubAllEnvs();
});
