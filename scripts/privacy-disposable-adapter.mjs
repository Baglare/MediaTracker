// Ops-only. No ordinary runtime import may reach Docker, credentials or Admin.
import { spawnSync } from "node:child_process";
import { assertUser, isOwnedAsset, erasePlan, verifyErasure, domains, ownerlessTables } from "./privacy-account-model.mjs";
import { captureContextSql, cleanupSql, inspectSql } from "./privacy-account-sql.mjs";

const fixtureLabel = "mediatracker-privacy-disposable-v1";
const dbContainer = "mediatracker_privacy_05f_db";
const apiContainer = "mediatracker_privacy_05f_api";

export function validateDisposableProof(db, api) {
  // Deliberate dedicated fixture label, exact local containers, dedicated DB,
  // exact loopback API mapping. No URL/name-only classification or env fallback.
  if (db?.Name !== `/${dbContainer}` || api?.Name !== `/${apiContainer}`
    || !db.State?.Running || !api.State?.Running
    || db.Config?.Labels?.["mediatracker.privacy.fixture"] !== fixtureLabel
    || api.Config?.Labels?.["mediatracker.privacy.fixture"] !== fixtureLabel
    || db.Config?.Labels?.["mediatracker.privacy.database"] !== "privacy_05f_disposable"
    || !/^supabase\/postgres:/.test(db.Config?.Image ?? "")
    || !/^kong:/.test(api.Config?.Image ?? "")) throw new Error("privacy_disposable_target_unproven");
  const ports = api.NetworkSettings?.Ports?.["8000/tcp"];
  if (!Array.isArray(ports) || ports.length !== 1 || ports[0].HostIp !== "127.0.0.1" || ports[0].HostPort !== "54321") throw new Error("privacy_disposable_target_unproven");
  // Kong must route to the dedicated fixture network, never a remote gateway.
  if (Object.keys(db.NetworkSettings?.Networks ?? {}).join() !== "mediatracker_privacy_05f_disposable"
    || Object.keys(api.NetworkSettings?.Networks ?? {}).join() !== "mediatracker_privacy_05f_disposable") throw new Error("privacy_disposable_target_unproven");
  return Object.freeze({ environment: "disposable", fingerprint: fixtureLabel, url: "http://127.0.0.1:54321" });
}

export function validateGatewayConfig(config) {
  const origins = new Set(["http://mediatracker_privacy_05f_auth:9999", "http://mediatracker_privacy_05f_storage:5000"]);
  if (!Array.isArray(config?.services) || config.services.length !== 2) throw new Error("privacy_disposable_gateway_unproven");
  const seen = new Set();
  const plugins = [...(config.plugins ?? [])];
  for (const service of config.services) {
    const url = new URL(service.url);
    if (!origins.has(url.origin) || url.pathname !== "/" || url.username || url.password || seen.has(url.origin)) throw new Error("privacy_disposable_gateway_unproven");
    seen.add(url.origin); plugins.push(...(service.plugins ?? []));
    for (const route of service.routes ?? []) plugins.push(...(route.plugins ?? []));
  }
  if (plugins.some((p) => !["key-auth", "acl", "cors", "request-transformer"].includes(p.name))) throw new Error("privacy_disposable_gateway_unproven");
}

export function validateDisposableSchema(schema) {
  const expected = [...Object.keys(domains), ...ownerlessTables].sort();
  if (JSON.stringify(schema?.tables?.slice().sort()) !== JSON.stringify(expected)
    || JSON.stringify(schema?.guardedTables?.slice().sort()) !== JSON.stringify(expected)
    || schema?.unsafePrivateGrants !== false || schema?.storageGuard !== true
    || schema?.helperSearchPath !== "search_path=pg_catalog, pg_temp") throw new Error("privacy_disposable_schema_unproven");
}

export function createOperationalAdapter({ sql, admin, target, userId }) {
  assertUser(userId);
  if (target?.environment !== "disposable" || target.fingerprint !== fixtureLabel || target.url !== "http://127.0.0.1:54321") throw new Error("privacy_disposable_target_unproven");
  const exact = (id) => { if (id !== userId) throw new Error("privacy_target_mismatch"); };
  async function inspect() {
    const source = await sql(inspectSql(userId));
    if (source?.schemaVersion !== 1) throw new Error("privacy_snapshot_invalid");
    return source;
  }
  async function listAssets() {
    const objects = [];
    const visit = async (prefix, depth) => {
      if (depth > 8) throw new Error("privacy_storage_depth");
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await admin.storage.from("profile-assets").list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
        if (error || !Array.isArray(data)) throw new Error("privacy_storage_inspect_failed");
        for (const item of data) {
          const name = `${prefix}/${item.name}`;
          if (!isOwnedAsset({ bucket: "profile-assets", name }, userId)) throw new Error("privacy_unsafe_asset");
          if (item.id == null) await visit(name, depth + 1);
          else objects.push(name);
        }
        if (data.length < 100) break;
      }
    };
    await visit(userId, 0);
    return objects.sort();
  }
  async function state() { return (await inspect()).lifecycle?.[userId] ?? "ABSENT"; }
  return {
    environment: "disposable", inspect,
    async recordStage(id, stage, status) {
      exact(id);
      if (!["lock-pending", "write-denial-verify", "lock-erasing", "application-cleanup", "storage-remove", "storage-verify", "application-verify", "barrier-verify", "auth-delete", "verify"].includes(stage)
        || !["PASS", "FAIL"].includes(status)) throw new Error("privacy_stage_invalid");
      await sql(`/* privacy-stage */ update private_privacy_ops.account_lifecycle set ${status === "PASS" ? `last_completed_stage='${stage}',failed_stage=null` : `failed_stage='${stage}'`} where user_id='${id}'::uuid;`);
    },
    async transition(id, value) {
      exact(id);
      if (!["ERASURE_PENDING", "ERASING"].includes(value)) throw new Error("privacy_transition_denied");
      if ((await state()) === "ABSENT" && !(await inspect()).auth.length) return;
      await sql(`begin; select private_privacy_ops.transition_account_v1('${id}'::uuid,'${value === "ERASING" ? "ERASING" : "ERASURE_PENDING"}','PRIVACY ${id}'); ${captureContextSql(id)} commit;`);
    },
    async assertLocked(id) {
      exact(id);
      if (!["ERASURE_PENDING", "ERASING", "ABSENT"].includes(await state())) throw new Error("privacy_lock_missing");
      // Probe the same pre-lock UUID via authenticated DB role, not Admin/RLS bypass.
      await sql(`begin; set local role authenticated; set local request.jwt.claim.sub='${id}';
        do $$ begin
          begin perform public.assert_account_write_allowed(); raise exception 'privacy_barrier_not_enforced';
          exception when sqlstate 'P0001' then if sqlerrm<>'account_write_locked' then raise; end if; end;
        end $$; rollback;`);
    },
    async cleanupApplication(id) { exact(id); if ((await state()) === "ABSENT") return; await sql(cleanupSql(id)); },
    async removeAssets(id, names) {
      exact(id);
      if (!["ERASING", "ABSENT"].includes(await state())) throw new Error("privacy_lock_missing");
      const inventory = [...new Set([...names, ...await listAssets()])];
      if (inventory.some((name) => !isOwnedAsset({ bucket: "profile-assets", name }, id))) throw new Error("privacy_unsafe_asset");
      for (let i = 0; i < inventory.length; i += 100) {
        const { error } = await admin.storage.from("profile-assets").remove(inventory.slice(i, i + 100));
        if (error) throw new Error("privacy_storage_remove_failed");
      }
    },
    async verifyAssets(id) { exact(id); if ((await listAssets()).length || (await inspect()).assets.length) throw new Error("privacy_storage_residual"); },
    async deleteAuth(id) {
      exact(id);
      const before = await inspect();
      if (!before.auth.length) return;
      const report = verifyErasure(before, id);
      if (report.residuals.some((r) => r !== "Auth present") || erasePlan(before, id).blocked.length) throw new Error("privacy_residual_before_auth");
      await this.verifyAssets(id); await this.assertLocked(id);
      if (await state() !== "ERASING") throw new Error("privacy_lock_missing");
      const { error } = await admin.auth.admin.deleteUser(id, false);
      if (error) throw new Error("privacy_auth_delete_failed");
      const { data, error: absenceError } = await admin.auth.admin.getUserById(id);
      if (data?.user || (absenceError && absenceError.status !== 404)) throw new Error("privacy_auth_absence_unproven");
    },
  };
}

export async function connectDisposableAdapter(userId) {
  assertUser(userId);
  const inspectDocker = (name) => {
    const result = spawnSync("docker", ["inspect", name], { encoding: "utf8", timeout: 5000 });
    if (result.status !== 0) throw new Error("privacy_disposable_target_unproven");
    return JSON.parse(result.stdout)[0];
  };
  const target = validateDisposableProof(inspectDocker(dbContainer), inspectDocker(apiContainer));
  const network = spawnSync("docker", ["network", "inspect", "mediatracker_privacy_05f_disposable"], { encoding: "utf8", timeout: 5000 });
  if (network.status !== 0 || JSON.parse(network.stdout)[0]?.Internal !== true) throw new Error("privacy_disposable_target_unproven");
  for (const [name, image] of [["mediatracker_privacy_05f_auth", /^supabase\/(?:gotrue|auth):/], ["mediatracker_privacy_05f_storage", /^supabase\/storage-api:/]]) {
    const service = inspectDocker(name);
    if (!service.State?.Running || !image.test(service.Config?.Image ?? "")
      || service.Config?.Labels?.["mediatracker.privacy.fixture"] !== fixtureLabel
      || Object.keys(service.NetworkSettings?.Networks ?? {}).join() !== "mediatracker_privacy_05f_disposable") throw new Error("privacy_disposable_target_unproven");
  }
  // Inspect gateway routing before any Admin HTTP call; loopback alone could be
  // a proxy to Production. Fixed path, no shell interpolation or remote config.
  const gateway = spawnSync("docker", ["exec", apiContainer, "cat", "/home/kong/kong.yml"], { encoding: "utf8", timeout: 5000 });
  if (gateway.status !== 0) throw new Error("privacy_disposable_gateway_unproven");
  const { load } = await import("js-yaml");
  validateGatewayConfig(load(gateway.stdout));
  const sql = async (query) => {
    const result = spawnSync("docker", ["exec", "-i", dbContainer, "psql", "-XAtq", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "privacy_05f_disposable"],
      { input: query, encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 });
    if (result.status !== 0) throw new Error("privacy_sql_failed");
    const line = result.stdout.trim().split(/\r?\n/).find((s) => s.startsWith("{"));
    return line ? JSON.parse(line) : null;
  };
  // An independently provisioned fixture marker must predate any privacy data read.
  const marker = await sql("select json_build_object('fingerprint',fingerprint) from private_privacy_ops.disposable_fixture_identity where singleton=true;");
  if (marker?.fingerprint !== fixtureLabel) throw new Error("privacy_disposable_target_unproven");
  const schema = await sql(`select jsonb_build_object(
    'tables',(select jsonb_agg(tablename order by tablename) from pg_catalog.pg_tables where schemaname='public'),
    'guardedTables',(select jsonb_agg(c.relname order by c.relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
      and exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=c.oid and t.tgname='a_privacy_row' and t.tgenabled='O')
      and exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=c.oid and t.tgname='a_privacy_statement' and t.tgenabled='O')),
    'storageGuard',exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid='storage.objects'::regclass and t.tgname='a_privacy_storage' and t.tgenabled='O'),
    'helperSearchPath',(select x from pg_catalog.pg_proc p,unnest(p.proconfig) x where p.oid='private_privacy_ops.assert_account_write_allowed_v1(uuid[])'::regprocedure and x like 'search_path=%'),
    'unsafePrivateGrants',exists(select 1 from pg_catalog.pg_roles r,pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where r.rolname in ('anon','authenticated','service_role') and n.nspname='private_privacy_ops' and c.relkind in ('r','p','v','m','f') and pg_catalog.has_table_privilege(r.rolname,c.oid,'SELECT,INSERT,UPDATE,DELETE'))
      or exists(select 1 from pg_catalog.pg_roles r,pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        where r.rolname in ('anon','authenticated','service_role') and n.nspname='private_privacy_ops' and pg_catalog.has_function_privilege(r.rolname,p.oid,'EXECUTE')));`);
  validateDisposableSchema(schema);
  const key = process.env.PRIVACY_DISPOSABLE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("privacy_disposable_admin_not_configured");
  const { createClient } = await import("@supabase/supabase-js");
  const localOnlyFetch = (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== target.url) throw new Error("privacy_disposable_network_denied");
    return fetch(input, { ...init, redirect: "error" });
  };
  const admin = createClient(target.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: localOnlyFetch } });
  return createOperationalAdapter({ sql, admin, target, userId });
}
