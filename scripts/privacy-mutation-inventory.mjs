// Read-only source inventory, deliberately outside the application dependency graph.
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { domains, ownerlessTables } from "./privacy-account-model.mjs";
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);

export function mutationInventory() {
  const functions = new Map();
  const authenticated = new Set();
  for (const file of readdirSync("supabase/migrations").filter((s) => s.endsWith(".sql")).sort()) {
    const text = readFileSync(`supabase/migrations/${file}`, "utf8");
    for (const m of text.matchAll(/create (?:or replace )?function (public\.\w+)\([\s\S]*?\$\$([\s\S]*?)\$\$;/gi)) {
      const writes = new Set([...m[2].matchAll(/\b(?:insert into|update|delete from)\s+public\.(\w+)/gi)].map((r) => r[1]));
      const calls = [...m[2].matchAll(/\b(public\.\w+)\s*\(/g)].map((r) => r[1]);
      functions.set(m[1], { file, writes, calls });
    }
    for (const g of text.matchAll(/grant execute on function ([\s\S]*?) to authenticated\s*;/gi)) {
      for (const f of g[1].matchAll(/public\.\w+(?=\()/g)) authenticated.add(f[0]);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of functions.values()) for (const call of item.calls) {
      for (const table of functions.get(call)?.writes ?? []) if (!item.writes.has(table)) { item.writes.add(table); changed = true; }
    }
  }
  const routes = [];
  for (const file of walk("app/api").filter((p) => p.endsWith("/route.ts"))) {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const rpcs = new Set(); const writes = new Set();
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const name = node.expression.name.text;
        if (name === "rpc" && ts.isStringLiteral(node.arguments[0])) rpcs.add(`public.${node.arguments[0].text}`);
        if (["insert", "update", "delete", "upsert"].includes(name)) {
          for (const m of node.getText(source).matchAll(/\.from\(["'](\w+)["']\)/g)) writes.add(m[1]);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    for (const rpc of rpcs) for (const table of functions.get(rpc)?.writes ?? []) writes.add(table);
    if (writes.size || /\.storage\.from\("profile-assets"\)\.(?:upload|remove|update|move|copy)\(/.test(text)) routes.push({ file,
      classification: text.includes("checkAccountWriteAllowed") ? "ROUTE_GUARDED_AND_DB_GUARDED" : "DB_GUARDED",
      tables: [...writes].sort(), rpcs: [...rpcs].sort() });
  }
  return {
    tables: [...Object.keys(domains).map((table) => ({ table, classification: "DB_GUARDED" })),
      ...ownerlessTables.map((table) => ({ table, classification: table === "embedding_cache" ? "DISABLED_V1" : "NOT_ACCOUNT_OWNED" }))],
    functions: [...functions].map(([name, f]) => ({ name, explicitlyAuthenticated: authenticated.has(name),
      classification: f.writes.size ? "DB_GUARDED" : "READ_ONLY", tables: [...f.writes].sort(), migration: f.file })),
    routes,
    limitations: ["Static body/call graph; overload privileges and dynamic caller names require the companion source audit", "Device-only writes remain local and cannot be erased remotely; Cloud recreation is DB denied", "Auth service metadata is outside application-owned rows; Auth deletion is last"],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(mutationInventory(), null, 2));
