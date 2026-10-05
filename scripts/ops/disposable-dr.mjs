import { spawnSync } from "node:child_process";
import { validateDisposableProof } from "../privacy-disposable-adapter.mjs";
import { hash, requireSafe, schemas } from "./recovery.mjs";

const container = "mediatracker_privacy_05f_db";
const database = "privacy_05f_disposable";
const label = "mediatracker-dr-disposable-v1";
// Never inherit DOCKER_HOST, context, PG*, service-role or application secrets.
function docker(args, input) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(?:PATH|SYSTEMROOT|WINDIR|TEMP|TMP|COMSPEC|PATHEXT)$/i.test(name)));
  const socket = process.platform === "win32" ? "npipe:////./pipe/dockerDesktopLinuxEngine" : "unix:///var/run/docker.sock";
  const result = spawnSync("docker", ["--host", socket, ...args], {env, input,
    timeout: 60_000, maxBuffer: 128*1024*1024, windowsHide: true});
  requireSafe(result.status === 0 && !result.error);
  return result.stdout;
}
function inspect(name) { return JSON.parse(docker(["inspect",name]).toString())[0]; }
export function validateDrProof(db,api,network,expectedFingerprint) {
  validateDisposableProof(db,api);
  requireSafe(network?.Internal === true && db.Mounts?.length === 0
    && !db.HostConfig?.Privileged && db.HostConfig?.NetworkMode !== "host"
    && Object.values(db.NetworkSettings?.Ports ?? {}).every(v => v === null)
    && /^[a-f0-9]{64}$/.test(db.Id ?? "") && /^[a-f0-9]{64}$/.test(network.Id ?? ""));
  const fingerprint=hash(JSON.stringify({container:db.Id,image:db.Image,network:network.Id,database,label}));
  requireSafe(fingerprint===expectedFingerprint);
  return fingerprint;
}
const relationFilter = "n.nspname in ('public','private_rate_limit','private_privacy_ops','supabase_migrations')";
// Encrypted only: object names/definitions/ACLs and aggregate row digests; never
// raw rows, emails, free text, Auth password hashes or decrypted Vault secrets.
export const verificationSql = `begin transaction isolation level repeatable read read only;
select jsonb_build_object(
 'managedBindings',coalesce((select jsonb_agg(pg_get_triggerdef(t.oid) order by n.nspname,c.relname,t.tgname)
   from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
   where ((n.nspname='auth' and c.relname='users' and t.tgname='privacy_initialize_account')
      or (n.nspname='storage' and c.relname='objects' and t.tgname='a_privacy_storage')) and t.tgenabled='O'),'[]'::jsonb),
 'tables',coalesce((select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'rls',c.relrowsecurity,
   'forceRls',c.relforcerowsecurity,'acl',c.relacl::text,'owner',pg_get_userbyid(c.relowner),
   'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
     pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d
     on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select jsonb_agg(jsonb_build_array(x.conname,x.contype,pg_get_constraintdef(x.oid),x.convalidated)
     order by x.conname) from pg_constraint x where x.conrelid=c.oid),
   'triggers',(select jsonb_agg(jsonb_build_array(t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by t.tgname)
     from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal),
   'policies',(select jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,
      (select array_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by r=0,pg_get_userbyid(r)) from unnest(p.polroles) r),
      pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
      from pg_policy p where p.polrelid=c.oid),
   'rowDigest',query_to_xml(format('select count(*) as n, md5(coalesce(string_agg(md5(row_to_json(t)::text), '''' order by md5(row_to_json(t)::text)),'''')) as digest from %I.%I t',n.nspname,c.relname),true,false,'')::text
 ) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where ${relationFilter} and c.relkind='r'),'[]'::jsonb),
 'functions',coalesce((select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
  'arguments',pg_get_function_identity_arguments(p.oid),'definitionHash',md5(pg_get_functiondef(p.oid)),
  'acl',p.proacl::text,'owner',pg_get_userbyid(p.proowner),'config',p.proconfig) order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${relationFilter} and p.prokind in ('f','p')),'[]'::jsonb),
 'ledger',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
 'authIdentityHash',(select md5(coalesce(string_agg(id::text,',' order by id),'')) from auth.users),
 'extensions',(select jsonb_agg(jsonb_build_array(e.extname,e.extversion,n.nspname) order by e.extname)
   from pg_extension e join pg_namespace n on n.oid=e.extnamespace),
 'roles',(select jsonb_agg(rolname order by rolname) from pg_roles),
 'roleConfiguration',(select jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls) order by rolname) from pg_roles),
 'memberships',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option) order by pg_get_userbyid(roleid),pg_get_userbyid(member)) from pg_auth_members),
 'unsafePrivateGrants',exists(select 1 from pg_roles r,pg_class c join pg_namespace n on n.oid=c.relnamespace
   where r.rolname in ('anon','authenticated','service_role') and n.nspname in ('private_privacy_ops','private_rate_limit')
     and c.relkind in ('r','p','v','m','f') and has_table_privilege(r.rolname,c.oid,'SELECT,INSERT,UPDATE,DELETE'))
   or exists(select 1 from pg_roles r,pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where r.rolname in ('anon','authenticated','service_role') and n.nspname in ('private_privacy_ops','private_rate_limit')
       and has_function_privilege(r.rolname,p.oid,'EXECUTE')));
rollback;`;

export function createDisposableDrAdapter() {
  let proven = false;
  let boundContainer;
  function sql(query) {
    requireSafe(proven);
    const bytes = docker(["exec","-i",boundContainer,"psql","-XAtq","-v","ON_ERROR_STOP=1","-U","postgres","-d",database],Buffer.from(query));
    const lines = bytes.toString().trim().split(/\r?\n/).filter(line => line.startsWith("{"));
    requireSafe(lines.length === 1); return JSON.parse(lines[0]);
  }
  return {
    async prove(expectedFingerprint) {
      proven = false;
      const db = inspect(container), api = inspect("mediatracker_privacy_05f_api");
      validateDisposableProof(db,api);
      const network = JSON.parse(docker(["network","inspect","mediatracker_privacy_05f_disposable"]).toString())[0];
      const fingerprint=validateDrProof(db,api,network,expectedFingerprint);
      // Subsequent operations bind immutable container identity, not a reused name.
      boundContainer=db.Id;
      proven = true;
      // Independent marker must be provisioned BEFORE this tool is permitted.
      // Fixture label/loopback alone are insufficient. Not a production migration.
      try {
        const marker = sql("begin read only; select json_build_object('label',label) from private_dr.fixture_identity where singleton=true; rollback;");
        requireSafe(marker.label === label);
      } catch { proven=false; throw new Error("Disposable identity marker refused"); }
      return {environment:"disposable", fingerprint};
    },
    async prerequisites() {
      return sql(`begin read only; select jsonb_build_object(
        'empty',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${relationFilter} and c.relkind in ('r','p','v','m','S','f'))
          and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${relationFilter}),
        'authIdentityHash',(select md5(coalesce(string_agg(id::text,',' order by id),'')) from auth.users),
        'roles',(select jsonb_agg(rolname order by rolname) from pg_roles),
        'roleConfiguration',(select jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls) order by rolname) from pg_roles),
        'memberships',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),pg_get_userbyid(grantor),admin_option) order by pg_get_userbyid(roleid),pg_get_userbyid(member)) from pg_auth_members),
        'extensions',(select jsonb_agg(jsonb_build_array(e.extname,e.extversion,n.nspname) order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace)); rollback;`);
    },
    async inspect() { return sql(verificationSql); },
    async versions() {
      requireSafe(proven);
      return Object.fromEntries(["pg_dump","pg_restore","psql"].map(tool => {
        const version = docker(["exec",boundContainer,tool,"--version"]).toString().match(/\b(\d+\.\d+(?:\.\d+)?)\b/);
        requireSafe(version); return [tool,version[1]];
      }));
    },
    async dump() {
      requireSafe(proven);
      // One internally consistent custom archive; preserve owner and ACLs.
      return docker(["exec",boundContainer,"pg_dump","--no-password","--format=custom","--lock-wait-timeout=5s",
        "-U","postgres","-d",database,...schemas.map(s => `--schema=${s}`)]);
    },
    async restore(section,dump) {
      requireSafe(proven && ["pre-data","data","post-data"].includes(section));
      docker(["exec","-i",boundContainer,"pg_restore","--no-password","--exit-on-error","--single-transaction",
        `--section=${section}`,"-U","postgres","-d",database],dump);
    },
    async restoreBindings(bindings) {
      requireSafe(proven && Array.isArray(bindings) && bindings.length===2
        && bindings.every(s=>typeof s==="string" && s.startsWith("CREATE TRIGGER ") && !s.includes(";")));
      docker(["exec","-i",boundContainer,"psql","-Xq","-v","ON_ERROR_STOP=1","-U","postgres","-d",database],
        Buffer.from(`begin;\n${bindings.join(";\n")};\ncommit;`));
    },
  };
}
