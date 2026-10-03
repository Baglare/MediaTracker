import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeLog, type SafeLogEvent } from "@/lib/security/safe-logging";
import { runSafeApiRoute, safeRouteLog } from "@/lib/api/safe-route";
import { supabaseApplicationError } from "@/lib/supabase/safe-error";

const secrets = ["Bearer credential-fixture", "cookie-session-fixture", "eyJhbGciOiJIUzI1NiJ9.fixture.signature", "private@example.test", "sb_secret_fixture", "postgres://owner:password-fixture@project-ref.test/db", "personal-note-fixture", "raw-search-fixture"];
afterEach(() => vi.restoreAllMocks());
describe("allowlisted telemetry", () => {
  it("drops secrets, nested objects and oversize values without serialization", () => {
    const sink = vi.spyOn(console, "warn").mockImplementation(() => {});
    const value = { event: "route_error", route: "/api/xp", method: "POST", status: 500, latencyMs: 7, errorCode: "internal_error", Authorization: secrets[0], Cookie: secrets[1], token: secrets[2], email: secrets[3], serviceRole: secrets[4], databaseUrl: secrets[5], note: secrets[6], query: secrets[7], nested: { headers: secrets, toJSON() { throw Error("must not serialize"); } }, provider: "x".repeat(10000) };
    safeLog(value as SafeLogEvent);
    const output = String(sink.mock.calls[0][0]);
    for (const secret of secrets) expect(output).not.toContain(secret);
    expect(JSON.parse(output)).toMatchObject({ event: "route_error", route: "/api/xp", method: "POST", status: 500, latencyMs: 7, errorCode: "internal_error" });
    expect(output.length).toBeLessThan(1024);
    expect(output).not.toContain("provider");
  });
  it.each(secrets)("rejects sensitive values even in allowlisted fields: %s", (secret) => {
    const sink = vi.spyOn(console, "warn").mockImplementation(() => {});
    safeLog({ event: "route_error", route: secret, provider: secret, errorCode: secret, method: secret, requestId: secret, deploymentSha: secret, schemaStage: secret } as SafeLogEvent);
    expect(String(sink.mock.calls[0][0])).not.toContain(secret);
  });
  it("ignores getters, hostile shapes and a throwing sink", () => {
    const getter = vi.fn(() => { throw Error("unsafe"); });
    const sink = vi.spyOn(console, "warn").mockImplementation(() => { throw Error("sink failed"); });
    expect(() => safeLog(Object.defineProperty({ event: "route_error" }, "errorCode", { get: getter }) as SafeLogEvent)).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(() => safeLog(new Proxy({} as SafeLogEvent, { getOwnPropertyDescriptor() { throw Error("proxy"); } }))).not.toThrow();
    expect(() => safeLog(null as unknown as SafeLogEvent)).not.toThrow();
    expect(() => safeRouteLog(Object.defineProperty({ event: "route_error" }, "errorCode", { get: getter }) as SafeLogEvent)).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledTimes(2);
  });
  it("bounds numeric fields and drops invalid numbers/unknown event", () => {
    const sink = vi.spyOn(console, "warn").mockImplementation(() => {});
    safeLog({ event: "route_error", status: 900, latencyMs: 1e12 });
    expect(JSON.parse(String(sink.mock.calls[0][0]))).toMatchObject({ latencyMs: 3600000 });
    expect(String(sink.mock.calls[0][0])).not.toContain("status");
    safeLog({ event: "route_error", latencyMs: NaN });
    expect(String(sink.mock.calls[1][0])).not.toContain("latencyMs");
    safeLog({ event: "private@example.test" } as unknown as SafeLogEvent);
    expect(sink).toHaveBeenCalledTimes(2);
  });
  it("isolates concurrent requests and correlates internal logs with response IDs", async () => {
    const sink = vi.spyOn(console, "warn").mockImplementation(() => {});
    const responses = await Promise.all(["/api/xp", "/api/tvmaze/search"].map((route) => runSafeApiRoute(route, "GET", async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      safeRouteLog({ event: "provider_error", provider: "tvmaze", errorCode: "upstream_error" });
      throw Error(secrets.join(" "));
    })));
    const ids = responses.map((r) => r.headers.get("x-request-id"));
    expect(new Set(ids).size).toBe(2);
    for (const response of responses) expect(await response.json()).toEqual({ error: "internal_error" });
    const logs = sink.mock.calls.map(([line]) => JSON.parse(String(line)));
    for (const id of ids) expect(logs.filter((log) => log.requestId === id)).toHaveLength(2);
    for (const secret of secrets) expect(JSON.stringify(logs)).not.toContain(secret);
  });
  it("preserves only exact Supabase application codes", () => {
    expect(supabaseApplicationError({ message: "not_allowed", details: secrets, hint: secrets }).message).toBe("not_allowed");
    expect(supabaseApplicationError({ message: `SQL not_allowed ${secrets.join(" ")}` }).message).toBe("database_operation_failed");
  });
});

const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
describe("production source logging boundary", () => {
  it("allows console sinks only in the central allowlist helper; no request/env/error dumps", () => {
    const failures: string[] = [];
    for (const file of ["app", "lib", "components", "features", "hooks"].flatMap(walk).filter((f) => /\.tsx?$/.test(f))) {
      const source = readFileSync(file, "utf8");
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const target = node.expression.expression.getText(ast);
          if (target === "console" && file.replaceAll("\\", "/") !== "lib/security/safe-logging.ts") failures.push(`${file}:console`);
          if (target === "JSON" && node.expression.name.text === "stringify" && node.arguments.some((arg) => /^(?:request|response|error|err|process\.env)(?:\.(?:headers|body))?$/.test(arg.getText(ast)))) failures.push(`${file}:raw serialization`);
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
    expect(failures).toEqual([]);
  });
  it("covers every exported API HTTP handler with an error/correlation boundary", () => {
    const failures: string[] = [];
    for (const file of walk("app/api").filter((f) => f.endsWith("route.ts"))) {
      const source = readFileSync(file, "utf8");
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) if (ts.isFunctionDeclaration(node) && node.name && /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/.test(node.name.text) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (!node.body?.getText(ast).includes("runSafeApiRoute(\"/api/")) failures.push(`${file}:${node.name.text}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
