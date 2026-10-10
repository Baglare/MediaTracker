import { expect, it, vi, afterEach } from 'vitest';
import { nativeConfig } from '@/lib/backend/native-config';
import { nativeRoles } from '@/lib/backend/native-roles.mjs';
import { resolve } from 'node:path';
import localMigrations from '@/lib/backend/native-migration-state.json';
import hostingMigrations from '@/lib/backend/native-hosting-migration-state.json';
const mocks=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('@/lib/backend/postgres',()=>({getNativePool:()=>({query:mocks.query})}));
vi.mock('@/lib/auth/current-user',()=>({getCurrentUser:vi.fn()}));
import { nativeDatabaseReady } from '@/lib/backend/transaction';
vi.mock('server-only',()=>({}));
afterEach(()=>vi.unstubAllEnvs());
it('binds hosted runtime to fixed profile, login and database with strict TLS CA path',()=>{
  for(const profile of ['hosting-test','hosting-production']) {
    const r=nativeRoles(profile);
    const env={NATIVE_ROLE_PROFILE:profile,DATABASE_URL:`postgresql://${r.runtime}:synthetic@127.0.0.1:5433/${r.database}`,
      DATABASE_SSL_MODE:'verify-full',DATABASE_SSL_CA_FILE:resolve('.codex/check/nonexistent-root.crt'),NODE_ENV:'production',
      BETTER_AUTH_URL:'https://app.example.invalid',BETTER_AUTH_SECRET:'a'.repeat(40)};
    expect(nativeConfig(env).roles.profile).toBe(profile);
    for(const patch of [{DATABASE_SSL_CA_FILE:''},{DATABASE_SSL_CA_FILE:'relative.crt'},{DATABASE_SSL_MODE:'disable'},
      {NATIVE_ROLE_PROFILE:'local'},{DATABASE_URL:env.DATABASE_URL.replace(r.runtime,r.owner)},
      {DATABASE_URL:env.DATABASE_URL.replace(`/${r.database}`,'/other')},{DATABASE_URL:env.DATABASE_URL+'?sslmode=disable'}])
      expect(()=>nativeConfig({...env,...patch})).toThrow('native_configuration_invalid');
  }
});
it('readiness selects the exact hosted execution checksums and rejects the other environment or incomplete history',async()=>{
  for(const profile of ['hosting-test','hosting-production'] as const) {
    vi.stubEnv('NATIVE_ROLE_PROFILE',profile);
    mocks.query.mockResolvedValue({rows:[{ready:true,state:hostingMigrations[profile]}]});
    expect(await nativeDatabaseReady(localMigrations)).toBe(true);
    const other=profile==='hosting-test'?'hosting-production':'hosting-test';
    for(const state of [hostingMigrations[other],hostingMigrations[profile].slice(1),localMigrations]) {
      mocks.query.mockResolvedValue({rows:[{ready:true,state}]});
      expect(await nativeDatabaseReady(localMigrations)).toBe(false);
    }
  }
});
