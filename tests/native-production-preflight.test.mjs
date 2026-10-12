import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productionInspection} from '../scripts/native-production-preflight.mjs';
import {nativeRoles} from '../lib/backend/native-roles.mjs';
test('production inspection accepts only the explicit loopback production target',async()=>{
  const roles=nativeRoles('hosting-production','shared-managed');
  const client={query:async()=>{throw new Error('must not connect');}};
  for(const url of ['postgresql://mt_prod_migrator:x@127.0.0.1:5433/mt_p4_test','postgresql://mt_prod_migrator:x@127.0.0.1:5432/mediatracker_prod','postgresql://mt_prod_migrator:x@other.invalid:5433/mediatracker_prod'])
    await assert.rejects(productionInspection(client,{roles,url:new URL(url)},{}),/native_production_target_invalid/);
});
test('empty target inspection stays read-only and finishes with rollback',async()=>{
  const calls=[];
  const client={query:async(sql)=>{calls.push(sql);
    if(sql.includes('session_user AS login'))return {rows:[{login:'mt_prod_migrator'}]};
    if(sql.includes('to_regclass'))return {rows:[{present:false}]};
    if(sql.includes(' AS dirty'))return {rows:[{dirty:false}]};
    return {rows:[]};
  }};
  const result=await productionInspection(client,{roles:nativeRoles('hosting-production','shared-managed'),url:new URL('postgresql://mt_prod_migrator:x@127.0.0.1:5433/mediatracker_prod'),kind:'migrator'},{});
  assert.equal(result.data,'EMPTY');assert.equal(result.pending.length,12);
  assert.equal(calls[0],'BEGIN READ ONLY');assert.equal(calls.at(-1),'ROLLBACK');
  assert.equal(calls.some(s=>/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(s)),false);
});
