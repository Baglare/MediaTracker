// Ops only; source planning is offline. Execution uses the existing positively
// proven disposable transport; no hosted connection string or web endpoint.
import { pathToFileURL } from "node:url";
import { assertTarget, migrationManifest, requireSafe } from "./recovery.mjs";

export function releaseFreezeSql(mode, revision) {
  requireSafe(["inspect","verify","freeze","unfreeze"].includes(mode));
  const versions = migrationManifest().map(m => `'${m.version}'`).join(",");
  const checks = `
    if exists(select 1 from auth.users u where not exists(select 1 from private_privacy_ops.account_lifecycle l where l.user_id=u.id))
      or exists(select 1 from private_privacy_ops.account_lifecycle where state not in ('ACTIVE','ERASURE_PENDING','ERASING'))
      then raise exception 'release_lifecycle_postcheck'; end if;
    if (select array_agg(version::text order by version) from supabase_migrations.schema_migrations)
      is distinct from array[${versions}]::text[] then raise exception 'release_ledger_postcheck'; end if;
    if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p') and (
        not c.relrowsecurity or not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=c.oid
          and t.tgname='a_release_write' and t.tgenabled='O' and t.tgtype=62 and t.tgqual is null and t.tgnargs=0
          and t.tgfoid='private_privacy_ops.guard_release_mutation_v1()'::regprocedure)))
      then raise exception 'release_table_postcheck'; end if;
    if exists(select 1 from (values
      ('auth.users','a_release_auth',62,'private_privacy_ops.guard_release_mutation_v1()',false),
      ('storage.objects','a_release_storage',31,'private_privacy_ops.guard_release_mutation_v1()',false),
      ('storage.objects','a_release_storage_truncate',34,'private_privacy_ops.guard_release_mutation_v1()',false),
      ('auth.users','privacy_initialize_account',5,'private_privacy_ops.initialize_account_v1()',false),
      ('storage.objects','a_privacy_storage',31,'private_privacy_ops.guard_account_mutation_v1()',true),
      ('private_privacy_ops.account_lifecycle','a_release_write',62,'private_privacy_ops.guard_release_mutation_v1()',false),
      ('private_privacy_ops.xp_cleanup_context','a_release_write',62,'private_privacy_ops.guard_release_mutation_v1()',false),
      ('private_privacy_ops.xp_detach_context','a_release_write',62,'private_privacy_ops.guard_release_mutation_v1()',false)) b(rel,trg,mask,fn,conditional)
      where not exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=b.rel::regclass and t.tgname=b.trg and t.tgenabled='O'
        and t.tgtype=b.mask and t.tgfoid=b.fn::regprocedure and t.tgnargs=0
        and ((not b.conditional and t.tgqual is null) or (b.conditional and pg_get_expr(t.tgqual,t.tgrelid)='(auth.uid() IS NOT NULL)'))))
      then raise exception 'release_binding_postcheck'; end if;
    if exists(select 1 from pg_catalog.pg_roles r,pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where r.rolname in ('anon','authenticated','service_role') and n.nspname='private_privacy_ops'
      and has_function_privilege(r.rolname,p.oid,'EXECUTE'))
      or exists(select 1 from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated','service_role')
        and has_table_privilege(r.rolname,'private_privacy_ops.release_write_state','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))
      then raise exception 'release_privilege_postcheck'; end if;`;
  const mutation = ["freeze","unfreeze"].includes(mode);
  if (mutation) requireSafe(Number.isSafeInteger(revision) && revision >= 0);
  // Unfreeze verification and CAS occur in ONE transaction, while Auth creation
  // is drained and singleton held exclusively. Any failed check rolls back ON.
  return `begin; ${mode === "unfreeze" ? "lock table auth.users in share row exclusive mode;" : ""}
    do $$ begin if session_user<>'postgres' or auth.uid() is not null then raise exception 'release_ops_denied'; end if; end $$;
    select singleton from private_privacy_ops.release_write_state where singleton for ${mutation ? "update" : "share"};
    ${["verify","unfreeze"].includes(mode) ? `do $$ begin ${checks} end $$;` : ""}
    ${mutation ? `select private_privacy_ops.set_release_freeze_v1(${mode === "freeze"},${revision});` : ""}
    select jsonb_build_object('frozen',frozen,'revision',revision,'postchecks',${["verify","unfreeze"].includes(mode)})
      from private_privacy_ops.release_write_state where singleton;
    ${mutation ? "commit" : "rollback"};`;
}

export async function runReleaseFreeze(options, adapter) {
  const mode=options.mode ?? "freeze-plan";
  requireSafe(["inspect","freeze-plan","freeze","verify","unfreeze-plan","unfreeze"].includes(mode));
  const mutation=["freeze","unfreeze"].includes(mode);
  requireSafe(!options.execute || mutation);
  if (mode.endsWith("-plan") || (mutation && !options.execute)) return {
    status:"PLAN_ONLY", mode, containment:"DB release_write_state + table/RPC/Auth/Storage/privacy triggers",
    executionTarget:"positively proven disposable only", postchecksRequired:true, autoUnfreeze:false,
    hostedProof:"LIVE_VALIDATION_REQUIRED",
  };
  assertTarget(options);
  requireSafe(adapter && process.env.CI !== "true" && process.env.GITHUB_ACTIONS !== "true");
  if (mutation) requireSafe(options.confirmation === `RELEASE ${mode.toUpperCase()} ${options.fingerprint}`);
  if (mode === "unfreeze") requireSafe(options.acknowledgePostchecks === true);
  await adapter.prove(options.fingerprint);
  const result = await adapter.releaseControl(mode,options.revision);
  requireSafe(result && typeof result.frozen === "boolean" && Number.isSafeInteger(result.revision));
  if (mode === "freeze") requireSafe(result.frozen);
  if (mode === "unfreeze") requireSafe(!result.frozen && result.postchecks === true);
  return {...result, execution:"DISPOSABLE_ONLY", hostedProof:"LIVE_VALIDATION_REQUIRED"};
}

export async function main(argv) {
  const allowed=new Set(["mode","environment","fingerprint","revision","confirmation","execute","ack-postchecks"]);
  const o={};
  for(let i=0;i<argv.length;i++) {
    const key=argv[i].slice(2);requireSafe(argv[i].startsWith("--") && allowed.has(key) && !Object.hasOwn(o,key));
    if(["execute","ack-postchecks"].includes(key)) o[key]=true;
    else {requireSafe(argv[i+1] && !argv[i+1].startsWith("--"));o[key]=argv[++i];}
  }
  const options={...o, revision:o.revision===undefined?undefined:Number(o.revision),acknowledgePostchecks:o["ack-postchecks"]};
  if (!o.execute && !["inspect","verify"].includes(o.mode)) return runReleaseFreeze(options);
  assertTarget(options);
  const {createDisposableDrAdapter}=await import("./disposable-dr.mjs");
  return runReleaseFreeze(options,createDisposableDrAdapter());
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r)))
    .catch(()=>{console.error("Release containment refused/failed; freeze is never automatically removed.");process.exitCode=1;});
}
