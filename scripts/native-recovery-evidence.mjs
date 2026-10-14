// Recovery evidence only: no data/credentials are returned, just bounded digests.
import { createHash } from 'node:crypto';
import { hostingSchemas, inspectHostingContract } from './native-hosting-contract.mjs';
import { digest } from './native-ops-target.mjs';
export const quoteIdentifier = value => '"'+value.replaceAll('"','""')+'"';
const MAX_BYTES=2*1024*1024*1024, MAX_ROWS=1000000;
// pg_dump/reparse can flatten nested AND nodes in CHECK expressions. Compare
// that grouping canonically, retaining every operand, literal, order and operator.
// Other constraints and every ownership/ACL/policy definition stay exact.
export function canonicalConstraintDefinition(definition) {
  if(!definition.startsWith('CHECK ('))return definition;
  const tokens=definition.match(/E'(?:\\[\s\S]|''|[^'\\])*'|'(?:''|[^'])*'|"(?:""|[^"])*"|[a-zA-Z_][a-zA-Z_0-9$]*|\S/g)??[];
  const endOfGroup=(items,start)=>{
    let depth=0;
    for(let i=start;i<items.length;i++){if(items[i]==='(')depth++;if(items[i]===')'&&--depth===0)return i;}
    throw new Error('native_recovery_constraint_invalid');
  };
  function normalize(items) {
    while(items[0]==='('&&endOfGroup(items,0)===items.length-1)items=items.slice(1,-1);
    const and=[],or=[];let cases=0;
    for(let i=0;i<items.length;i++) {
      if(items[i]==='('){i=endOfGroup(items,i);continue;}
      if(items[i]==='CASE')cases++;if(items[i]==='END')cases--;
      if(!cases&&items[i]==='AND')and.push(i);if(!cases&&items[i]==='OR')or.push(i);
    }
    const splits=or.length?or:and;
    if(splits.length) {
      const parts=[];let start=0;
      for(const end of [...splits,items.length]){parts.push(normalize(items.slice(start,end)));start=end+1;}
      return or.length?{or:parts}:{and:parts.flatMap(p=>p.and??[p])};
    }
    const result=[];
    for(let i=0;i<items.length;i++) {
      if(items[i]==='('){const end=endOfGroup(items,i);result.push({group:normalize(items.slice(i+1,end))});i=end;}
      else result.push(items[i]);
    }
    return result;
  }
  return JSON.stringify(normalize(tokens));
}
export async function inspectBackupCoverage(client,roles) {
  if(!roles?.hosted || roles.capability!=='shared-managed')throw new Error('native_backup_profile_invalid');
  await inspectHostingContract(client,roles,false,true);
  const schemas=hostingSchemas(roles).map(s=>s.schema);
  const policy=`((CURRENT_USER = '${roles.backup}'::name) AND (SESSION_USER = '${roles.backup}'::name))`;
  const safe=(await client.query(`SELECT current_user=$1 AND session_user=$1
    AND current_setting('server_version_num')::integer/10000=18
    AND EXISTS(SELECT FROM pg_roles WHERE rolname=$1 AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR rolinherit))
    AND NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid=$1::regrole)
    AND NOT EXISTS(SELECT FROM pg_roles r WHERE r.rolname<>$1 AND pg_has_role($1,r.oid,'USAGE'))
    AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname=ANY($2::text[]) AND NOT has_schema_privilege($1,n.oid,'USAGE'))
    AND NOT EXISTS(SELECT FROM pg_namespace n WHERE has_schema_privilege($1,n.oid,'CREATE'))
    AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='native_auth' AND c.relname='email_verification_key' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity))
    AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=ANY($2::text[]) AND has_function_privilege($1,p.oid,'EXECUTE')
        AND NOT (n.nspname='app' AND p.proname IN ('native_ops_state','native_ops_assets','native_ops_lifecycle_state') AND p.pronargs=0))
    AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE n.nspname=ANY($2::text[]) AND a.grantee=$1::regrole AND a.is_grantable)
    AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($2::text[])
      AND c.relkind IN ('r','p','S') AND (c.relowner=$1::regrole
        OR CASE WHEN c.relkind='S' THEN NOT has_sequence_privilege($1,c.oid,'SELECT') OR has_sequence_privilege($1,c.oid,'UPDATE,USAGE')
          ELSE NOT has_table_privilege($1,c.oid,'SELECT') OR has_table_privilege($1,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege($1,c.oid,'INSERT,UPDATE,REFERENCES') END))
    AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($2::text[])
      AND c.relkind IN ('r','p') AND c.relrowsecurity AND (NOT c.relforcerowsecurity OR (NOT (n.nspname='native_auth' AND c.relname='email_verification_key') AND NOT EXISTS(
        SELECT FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='native_backup_select' AND p.polcmd='r'
          AND p.polpermissive AND p.polroles=ARRAY[$1::regrole::oid] AND pg_get_expr(p.polqual,p.polrelid)=$3))))
    AND NOT EXISTS(SELECT FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($2::text[]) AND NOT p.polpermissive AND p.polcmd IN ('r','*')
        AND EXISTS(SELECT FROM unnest(p.polroles) role_id WHERE role_id=0 OR pg_has_role($1,role_id,'USAGE')))
    AND NOT EXISTS(SELECT FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=ANY($2::text[]) AND p.polpermissive AND p.polcmd IN ('r','*') AND p.polname<>'native_backup_select'
        AND EXISTS(SELECT FROM unnest(p.polroles) role_id WHERE role_id=0 OR pg_has_role($1,role_id,'USAGE')))
    AS safe`,[roles.backup,schemas,policy])).rows[0]?.safe;
  if(safe!==true)throw new Error('native_backup_coverage_invalid');
  return {coverage:'ALL_MANAGED_TABLES',restrictive:'NONE_APPLICABLE',membership:'ISOLATED',rls:'PRESERVED'};
}
export async function recoveryRoles(client,roles) {
  const names=[...new Set(Object.values(roles).filter(v=>typeof v==='string' && /^mt_(test|prod)_/.test(v)))];
  const attributes=(await client.query(`SELECT rolname AS name,rolcanlogin AS login,rolinherit AS inherit,
    rolconnlimit AS "limit" FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname COLLATE "C"`,[names])).rows;
  const settings=(await client.query(`SELECT r.rolname AS name,CASE WHEN s.setdatabase=0 THEN NULL ELSE d.datname END AS database,
    s.setconfig AS config FROM pg_db_role_setting s JOIN pg_roles r ON r.oid=s.setrole
    LEFT JOIN pg_database d ON d.oid=s.setdatabase WHERE r.rolname=ANY($1::text[])
    AND (s.setdatabase=0 OR d.datname=current_database()) ORDER BY r.rolname COLLATE "C",s.setdatabase=0`,[names])).rows;
  if(attributes.length!==names.length || settings.some(s=>s.config.some(c=>!/^(search_path|statement_timeout|lock_timeout|idle_in_transaction_session_timeout)=/.test(c))))
    throw new Error('native_recovery_role_settings_invalid');
  return {attributes,settings};
}
export async function recoveryDatabaseContract(client) {
  const identity=(await client.query(`SELECT d.datname AS name,r.rolname AS owner FROM pg_database d
    JOIN pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database()`)).rows[0];
  const acl=(await client.query(`SELECT * FROM (SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
    grantor.rolname AS grantor,a.privilege_type AS privilege,a.is_grantable AS grantable
    FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
    LEFT JOIN pg_roles grantee ON grantee.oid=a.grantee JOIN pg_roles grantor ON grantor.oid=a.grantor
    WHERE d.datname=current_database()) grants ORDER BY grantee COLLATE "C",grantor COLLATE "C",privilege COLLATE "C"`)).rows;
  return {...identity,acl};
}
export async function recoveryInventory(client,roles) {
  // Caller owns a REPEATABLE READ transaction. pg_dump imports that exact snapshot.
  const schemas=hostingSchemas(roles).map(s=>s.schema);
  await client.query("SET LOCAL timezone='UTC'; SET LOCAL datestyle='ISO, YMD'; SET LOCAL extra_float_digits=3");
  const tables=(await client.query(`SELECT n.nspname AS schema,c.relname AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p')
    AND NOT c.relispartition AND NOT (n.nspname='native_auth' AND c.relname='email_verification_key') ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,[schemas])).rows;
  if(!tables.length || tables.length>1000)throw new Error('native_recovery_inventory_invalid');
  const inventory=[];let bytes=0,total=0;
  for(const table of tables) {
    const name=quoteIdentifier(table.schema)+'.'+quoteIdentifier(table.name),hash=createHash('sha256');let count=0;
    await client.query(`DECLARE native_recovery_rows NO SCROLL CURSOR FOR SELECT row_to_json(t)::text AS row FROM ${name} t ORDER BY row_to_json(t)::text COLLATE "C"`);
    try {
      for(;;) {
        const rows=(await client.query('FETCH 500 FROM native_recovery_rows')).rows;
        if(!rows.length)break;
        for(const {row} of rows) {
          bytes+=Buffer.byteLength(row);total++;count++;
          if(bytes>MAX_BYTES || total>MAX_ROWS)throw new Error('native_recovery_capacity');
          hash.update(row+'\n');
        }
      }
    } finally {await client.query('CLOSE native_recovery_rows');}
    inventory.push({...table,count,checksum:hash.digest('hex')});
  }
  const catalog=(await client.query(`SELECT kind,identity,definition FROM (
    SELECT 'schema' AS kind,n.nspname::text AS identity,jsonb_build_object('owner',r.rolname,'acl',ARRAY(SELECT acl::text FROM unnest(n.nspacl) acl ORDER BY acl::text COLLATE "C"))::text AS definition
      FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=ANY($1::text[])
    UNION ALL SELECT 'relation',n.nspname||'.'||c.relname,jsonb_build_object('owner',r.rolname,'acl',ARRAY(SELECT acl::text FROM unnest(c.relacl) acl ORDER BY acl::text COLLATE "C"),
      'kind',c.relkind,'rls',c.relrowsecurity,'force',c.relforcerowsecurity)::text FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','S','v','m')
    UNION ALL SELECT 'column',n.nspname||'.'||c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),
      'notnull',a.attnotnull,'position',a.attnum,'identity',a.attidentity,'generated',a.attgenerated,'acl',ARRAY(SELECT acl::text FROM unnest(a.attacl) acl ORDER BY acl::text COLLATE "C"),
      'default',pg_get_expr(d.adbin,d.adrelid))::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE n.nspname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'policy',n.nspname||'.'||c.relname||'.'||p.polname,jsonb_build_object('cmd',p.polcmd,'permissive',p.polpermissive,
      'roles',(SELECT array_agg(CASE WHEN id=0 THEN 'PUBLIC' ELSE id::regrole::text END ORDER BY id::regrole::text) FROM unnest(p.polroles) id),
      'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))::text
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[])
    UNION ALL SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
      jsonb_build_object('owner',r.rolname,'acl',ARRAY(SELECT acl::text FROM unnest(p.proacl) acl ORDER BY acl::text COLLATE "C"),'body',pg_get_functiondef(p.oid))::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname=ANY($1::text[]) AND p.prokind IN ('f','p')
    UNION ALL SELECT 'constraint',n.nspname||'.'||c.relname||'.'||k.conname,pg_get_constraintdef(k.oid)
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[])
    UNION ALL SELECT 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid)||':'||t.tgenabled::text
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[]) AND NOT t.tgisinternal
    UNION ALL SELECT 'index',n.nspname||'.'||c.relname,pg_get_indexdef(c.oid)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1::text[]) AND c.relkind='i'
    UNION ALL SELECT 'default_acl',n.nspname||'.'||r.rolname||'.'||a.defaclobjtype::text,to_json(ARRAY(SELECT acl::text FROM unnest(a.defaclacl) acl ORDER BY acl::text COLLATE "C"))::text
      FROM pg_default_acl a JOIN pg_namespace n ON n.oid=a.defaclnamespace JOIN pg_roles r ON r.oid=a.defaclrole WHERE n.nspname=ANY($1::text[])
  ) catalog ORDER BY kind COLLATE "C",identity COLLATE "C"`,[schemas])).rows;
  const sequences=[];
  for(const entry of catalog.filter(e=>e.kind==='relation' && JSON.parse(e.definition).kind==='S')) {
    const [schema,name]=entry.identity.split('.');
    sequences.push({identity:entry.identity,...(await client.query(`SELECT last_value::text,is_called FROM ${quoteIdentifier(schema)}.${quoteIdentifier(name)}`)).rows[0]});
  }
  const canonical=catalog.map(c=>({...c,definition:c.kind==='constraint'?canonicalConstraintDefinition(c.definition):c.definition}));
  return {tables:inventory,sequences,catalogChecksum:digest(canonical)};
}
export function assertRecoveryInventory(actual,expected) {
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('native_restore_inventory_mismatch');
}
