import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {nativeSignupEnabled} from '@/lib/auth/signup-policy';
it('keeps release admission closed unless explicitly enabled',()=>{
  for(const value of [undefined,'','false','1','TRUE']) expect(nativeSignupEnabled({NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED:value})).toBe(false);
  expect(nativeSignupEnabled({NEXT_PUBLIC_NATIVE_SIGNUP_ENABLED:'true'})).toBe(true);
});
it('adds only user INSERT while preserving lifecycle, freeze and closed roles',()=>{
  const sql=readFileSync('database/native/012_public_signup.sql','utf8');
  expect(sql).toContain('GRANT INSERT ON native_auth."user" TO mt_auth_access');
  expect(sql).not.toMatch(/GRANT\s+(?:DELETE|UPDATE|ALL)|BYPASSRLS|DISABLE\s+ROW|DROP|CREATE\s+ROLE/i);
  const admission=readFileSync('database/native/003_account_admission.sql','utf8');
  expect(admission).toContain('CREATE TRIGGER initialize_account AFTER INSERT');
  expect(admission).toContain('CREATE TRIGGER release_admission BEFORE INSERT');
});
