import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV = [
  "SUPABASE_TEST_URL",
  "SUPABASE_TEST_ANON_KEY",
  "SUPABASE_TEST_USER_A_EMAIL",
  "SUPABASE_TEST_USER_A_PASSWORD",
  "SUPABASE_TEST_USER_B_EMAIL",
  "SUPABASE_TEST_USER_B_PASSWORD",
];

function origin(value, label) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.origin.toLowerCase();
  } catch {
    throw new Error(`${label} geçerli bir HTTP(S) URL olmalı.`);
  }
}

export function assertSmokeEnvironment(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`Eksik environment değişkenleri: ${missing.join(", ")}`);
  }
  const testOrigin = origin(env.SUPABASE_TEST_URL, "SUPABASE_TEST_URL");
  const productionCandidates = [
    env.SUPABASE_PRODUCTION_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
  ].filter(Boolean);
  if (productionCandidates.some(
    (value) => origin(value, "Production Supabase URL") === testOrigin,
  )) {
    throw new Error(
      "DURDURULDU: SUPABASE_TEST_URL production Supabase origin ile eşleşiyor.",
    );
  }
  return { testOrigin };
}

if (process.argv.includes("--preflight-only")) {
  try {
    assertSmokeEnvironment();
    console.info("D2C.2 browser smoke preflight başarılı.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Preflight başarısız.");
    process.exitCode = 1;
  }
} else {
  await runSmoke();
}

async function runSmoke() {
  assertSmokeEnvironment();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const runId = `d2c2-browser-${randomUUID()}`;
  const titleA = `${runId}-user-a`;
  const titleB = `${runId}-user-b`;
  const port = process.env.CLOUD_V2_BROWSER_SMOKE_PORT ?? "3100";
  const appUrl = `http://127.0.0.1:${port}`;
  let epoch = `${runId}-epoch-1`;
  let maintenance = false;
  let child = null;
  let shuttingDown = false;

  const childEnvironment = () => ({
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_TEST_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_TEST_ANON_KEY,
    NEXT_PUBLIC_CLOUD_MEDIA_V2_ENABLED: "true",
    NEXT_PUBLIC_CLOUD_MEDIA_SCHEMA_STAGE: "d2c1",
    NEXT_PUBLIC_CLOUD_MEDIA_DEPLOYMENT_EPOCH: epoch,
    NEXT_PUBLIC_CLOUD_MEDIA_MINIMUM_CLIENT_VERSION: "d2c2",
    NEXT_PUBLIC_CLOUD_MEDIA_MAINTENANCE: maintenance ? "true" : "false",
  });

  async function stopServer() {
    if (!child || child.exitCode !== null) return;
    const stopped = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    child = null;
  }

  async function startServer() {
    await stopServer();
    child = spawn(
      process.execPath,
      [nextBin, "dev", "--hostname", "127.0.0.1", "--port", port],
      {
        cwd: root,
        env: childEnvironment(),
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.once("exit", (code) => {
      if (!shuttingDown && code !== 0 && code !== null) {
        console.error(`Next.js smoke server beklenmedik biçimde kapandı (${code}).`);
      }
    });
    await waitForRollout(appUrl, epoch, maintenance);
  }

  async function restart(mode) {
    if (mode === "epoch") {
      epoch = `${runId}-epoch-${Date.now()}`;
      maintenance = false;
    } else {
      maintenance = mode === "maintenance";
    }
    await startServer();
    console.info(
      mode === "epoch"
        ? "Deployment epoch değiştirildi. Açık sekmede reload bildiriminin görünmesini bekle."
        : maintenance
          ? "Bakım modu açıldı. Açık sekmede bakım bildiriminin görünmesini bekle."
          : "Normal V2 modu yeniden açıldı.",
    );
  }

  async function cleanup() {
    const results = [];
    for (const account of [
      {
        label: "A",
        email: process.env.SUPABASE_TEST_USER_A_EMAIL,
        password: process.env.SUPABASE_TEST_USER_A_PASSWORD,
        title: titleA,
      },
      {
        label: "B",
        email: process.env.SUPABASE_TEST_USER_B_EMAIL,
        password: process.env.SUPABASE_TEST_USER_B_PASSWORD,
        title: titleB,
      },
    ]) {
      const client = createClient(
        process.env.SUPABASE_TEST_URL,
        process.env.SUPABASE_TEST_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const signedIn = await client.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });
      if (signedIn.error) {
        results.push(`${account.label}: login-failed`);
        continue;
      }
      const media = await client
        .from("media_items")
        .select("id,revision,deleted_at,title")
        .eq("title", account.title);
      if (media.error) {
        results.push(`${account.label}: lookup-failed`);
        await client.auth.signOut();
        continue;
      }
      let cleaned = 0;
      for (const row of media.data ?? []) {
        if (row.title !== account.title) continue;
        const progress = await client
          .from("progress_logs")
          .select("id,revision,deleted_at")
          .eq("media_id", row.id);
        for (const log of progress.data ?? []) {
          if (log.deleted_at) continue;
          await client.rpc("apply_progress_log_sync_operation", {
            p_operation_id: `${runId}-cleanup-${account.label}-progress-${log.id}`,
            p_record_id: log.id,
            p_operation_type: "delete",
            p_expected_revision: log.revision,
            p_payload: null,
          });
        }
        if (!row.deleted_at) {
          const removed = await client.rpc("apply_media_item_sync_operation", {
            p_operation_id: `${runId}-cleanup-${account.label}-media-${row.id}`,
            p_record_id: row.id,
            p_operation_type: "delete",
            p_expected_revision: row.revision,
            p_payload: null,
          });
          if (!removed.error) cleaned += 1;
        }
      }
      await client.auth.signOut();
      results.push(`${account.label}: ${cleaned} synthetic media tombstoned`);
    }
    console.info(`Cleanup: ${results.join("; ")}`);
  }

  async function shutdown(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    await cleanup();
    await stopServer();
    process.exitCode = exitCode;
  }

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  await startServer();
  printChecklist({ appUrl, runId, titleA, titleB });

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  terminal.on("line", async (value) => {
    const command = value.trim().toLowerCase();
    try {
      if (command === "epoch") await restart("epoch");
      else if (command === "maintenance") await restart("maintenance");
      else if (command === "normal") await restart("normal");
      else if (command === "cleanup") await cleanup();
      else if (command === "quit") {
        terminal.close();
        await shutdown();
      } else {
        console.info("Komutlar: epoch | maintenance | normal | cleanup | quit");
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Smoke komutu başarısız.");
    }
  });
}

async function waitForRollout(appUrl, expectedEpoch, expectedMaintenance) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${appUrl}/api/cloud/rollout`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (
        response.ok
        && payload.schemaStage === "d2c1"
        && payload.deploymentEpoch === expectedEpoch
        && payload.maintenance === expectedMaintenance
      ) return;
    } catch {
      // Server henüz hazır değil.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("V2 rollout endpoint 30 saniye içinde doğrulanamadı.");
}

function printChecklist({ appUrl, runId, titleA, titleB }) {
  console.info(`
D2C.2 MANUEL BROWSER SMOKE
URL: ${appUrl}
Run ID: ${runId}
User A sentetik başlığı: ${titleA}
User B sentetik başlığı: ${titleB}

1. User A ile giriş yap. Cloud Sync kartında "Cloud V2", "D2C1" ve sağlıklı durumunu doğrula.
2. Yalnız yukarıdaki User A başlığıyla manuel media ekle; create, update, progress ve synced geçişlerini izle.
3. DevTools Network throttling/offline ile pending/retryable; gönderim sırasında in-flight durumunu doğrula.
4. İkinci sekmede aynı User A ile remote revision değiştirip ilk sekmede stale edit yap; revision_mismatch kartını doğrula.
5. İkinci sekmede media'yı silip ilk sekmede stale edit yap; tombstone kartından explicit restore'u doğrula.
6. User B'ye geç. User A queue/revision/conflict durumunun görünmediğini doğrula; yalnız User B sentetik başlığını kullan.
7. Terminalde "maintenance" yaz; bakım bildirimini doğrula. "normal" ile geri dön.
8. Terminalde "epoch" yaz; reload bildiriminin çıktığını doğrula ve sayfayı yenile.
9. Reload sonrası owner-scoped queue/revision durumunun korunduğunu doğrula.
10. Console'da hydration, infinite-loop/maximum-depth, raw SQL, stack trace veya secret olmadığını kontrol et.
11. "cleanup" yalnız bu run'ın tam eşleşen sentetik başlıklarını tombstone eder. Bitince "quit" yaz.

Not: Browser otomasyon dependency'si bulunmadığından UI adımları manueldir; runner environment,
server lifecycle, production guard, epoch/maintenance ve sentetik cleanup işlemlerini tekrarlar.
`);
}
