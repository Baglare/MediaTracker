import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPrivacyPolicyAddition } from './native-release-pg18.mjs';

const qual="((CURRENT_USER = 'mt_owner'::name) AND (SESSION_USER <> 'mt_runtime'::name) AND pg_has_role(SESSION_USER, 'mt_privacy_operator'::name, 'MEMBER'::text) AND (app.current_user_id() IS NULL))";
const old={schemaname:'app',tablename:'media_items',policyname:'owner_scope',permissive:'PERMISSIVE',roles:['mt_runtime','mt_owner'],cmd:'ALL',qual:'user_id = app.current_user_id()',with_check:'user_id = app.current_user_id()'};
const added=['cloud_media_sync_operations','goal_sync_operations','goals','media_items','progress_logs']
  .flatMap(tablename=>['DELETE','SELECT'].map(cmd=>({schemaname:'app',tablename,policyname:'native_privacy_'+cmd.toLowerCase(),permissive:'PERMISSIVE',roles:['mt_owner'],cmd,qual,with_check:null})));
const sorted=rows=>rows.sort((a,b)=>[a.schemaname,a.tablename,a.policyname].join('.').localeCompare([b.schemaname,b.tablename,b.policyname].join('.')));
test('upgrade preserves every prior policy and admits only the exact ten 015 additions',()=>{
  assertPrivacyPolicyAddition([old],sorted([old,...added]));
});
test('upgrade rejects altered or removed pre-existing owner policies',()=>{
  assert.throws(()=>assertPrivacyPolicyAddition([old],sorted([{...old,qual:'true'},...added])));
  assert.throws(()=>assertPrivacyPolicyAddition([old],added));
});
test('upgrade rejects missing or unexpected additions',()=>{
  assert.throws(()=>assertPrivacyPolicyAddition([old],sorted([old,...added.slice(1)])));
  assert.throws(()=>assertPrivacyPolicyAddition([old],sorted([old,...added,{...added[0],policyname:'unexpected'}])));
});
test('upgrade rejects public/runtime/backup authority or broader policy commands and predicates',()=>{
  for(const patch of [{roles:['public']},{roles:['mt_runtime']},{roles:['mt_backup']},{cmd:'ALL'},{cmd:'UPDATE'},{qual:'true'},{with_check:'true'},{schemaname:'native_auth'},{permissive:'RESTRICTIVE'}]) {
    assert.throws(()=>assertPrivacyPolicyAddition([old],sorted([old,{...added[0],...patch},...added.slice(1)])));
  }
});
