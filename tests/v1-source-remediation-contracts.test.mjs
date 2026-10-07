import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkRetentionCompleteness } from "../scripts/privacy-retention-ops.mjs";

const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);
test("every server route body parser delegates to bounded pre-parse primitive",()=>{
  for(const file of walk("app/api").filter(p=>p.endsWith(".ts"))) {
    const source=readFileSync(file,"utf8");
    assert.ok(!/\b(?:request|req)\.(?:json|text|formData|arrayBuffer|blob)\s*\(/.test(source),file);
    assert.ok(!/\b(?:request|req)\.body\.(?:getReader|pipeTo|pipeThrough)/.test(source),file);
  }
  const shared=readFileSync("lib/social/route-response.ts","utf8");
  assert.match(shared,/readBoundedJson\(request, 16_384\)/);
  for(const file of walk("app/api").filter(p=>/\/(?:tvmaze|openlibrary|anilist|tmdb)\//.test(p)&&p.endsWith("route.ts"))) {
    assert.ok(!/\b(?:await|return) fetch\(/.test(readFileSync(file,"utf8")),file);
  }
});
test("new migration table absent from classification cannot silently pass",()=>{
  const directory=mkdtempSync(path.join(tmpdir(),"h08-retention-contract-"));
  try {
    mkdirSync(path.join(directory,"supabase/migrations"),{recursive:true});
    writeFileSync(path.join(directory,"supabase/migrations/20261006130000_unclassified.sql"),"create table public.future_account_data(id uuid);");
    assert.throws(()=>checkRetentionCompleteness(directory),/Unclassified source tables: future_account_data/);
  } finally {assert.ok(path.basename(directory).startsWith("h08-retention-contract-"));rmSync(directory,{recursive:true,force:true});}
});
test("README names current authority and limits AI examples to local development",()=>{
  const readme=readFileSync("README.md","utf8");
  for(const doc of ["V1_HARDENING_06D_RELEASE_OPERATIONS.md","V1_HARDENING_06E_OPERATIONAL_RELEASE_GATE.md"])assert.ok(readme.includes(`docs/${doc}`));
  assert.ok(!readme.includes("Production veritabanında D2B.0 ve D2B.1 uygulanmıştır"));
  for(const name of ["OPENAI_API_KEY","GEMINI_API_KEY","OPENROUTER_API_KEY","GROQ_API_KEY"])assert.ok(readme.includes(`| \`${name}\` | Production v1 yasak; yalnız ayrı local geliştirme |`));
});
