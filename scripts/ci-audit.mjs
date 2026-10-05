import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const exception = Object.freeze({
  id: "V1-SEC-EXCEPTION-001",
  advisory: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  cve: "CVE-2026-93687", // npm audit v2 supplies GHSA URL, not CVE.
  expires: "2026-11-03",
  chain: ["eslint-config-next", "@next/eslint-plugin-next", "fast-glob", "micromatch", "braces"],
  versions: ["16.3.8", "16.3.8", "3.3.1", "4.0.8", "3.0.3"],
});

function requireContract(condition, message) {
  if (!condition) throw new Error(message);
}

export function verifyAudit(report, lock, now = new Date()) {
  requireContract(report?.auditReportVersion === 2 && !report.error && report.vulnerabilities
    && report.metadata?.vulnerabilities, "Invalid/unavailable npm audit report");
  const entries = Object.entries(report.vulnerabilities);
  const severe = entries.filter(([, entry]) => ["high", "critical"].includes(entry.severity));
  const counts = report.metadata.vulnerabilities;
  requireContract(Number.isInteger(counts.high) && Number.isInteger(counts.critical)
    && counts.high + counts.critical === severe.length, "Audit severity totals disagree");
  // A patched/absent advisory does not require an exception, even after expiry.
  if (severe.length === 0) return { accepted: 0, high: 0, critical: 0 };
  requireContract(now.toISOString().slice(0, 10) <= exception.expires, "Security exception expired; review required");
  requireContract(severe.length === exception.chain.length
    && severe.every(([name]) => exception.chain.includes(name)), "Unknown High/Critical dependency");
  requireContract(lock?.lockfileVersion === 3 && lock.packages, "Missing lockfile v3");
  requireContract(!lock.packages[""].dependencies?.[exception.chain[0]]
    && lock.packages[""].devDependencies?.[exception.chain[0]], "Exception root must remain dev-only");
  for (const [index, name] of exception.chain.entries()) {
    const entry = report.vulnerabilities[name];
    const node = `node_modules/${name}`;
    const packages = Object.entries(lock.packages).filter(([path]) => path.endsWith(node));
    requireContract(packages.length === 1 && packages[0][0] === node
      && packages[0][1].dev === true && packages[0][1].version === exception.versions[index],
    "Exception package version/path/dev classification changed");
    const fix = entry?.fixAvailable;
    // npm's reviewed breaking downgrade removes the chain, not an upstream braces patch.
    const reviewedDowngrade = fix && typeof fix === "object" && fix.name === "eslint-config-next"
      && fix.version === "14.2.35" && fix.isSemVerMajor === true
      && Object.keys(fix).sort().join() === "isSemVerMajor,name,version";
    requireContract(entry?.name === name && entry.severity === "high" && (fix === false || reviewedDowngrade)
      && entry.isDirect === (index === 0) && entry.nodes?.length === 1 && entry.nodes[0] === node,
    "Exception audit entry changed or patch available");
    const parentNames = Object.entries(lock.packages)
      .filter(([, pkg]) => pkg.dependencies?.[name] || pkg.optionalDependencies?.[name] || pkg.peerDependencies?.[name])
      .map(([path]) => path);
    const expectedParent = index === 0 ? [] : [`node_modules/${exception.chain[index - 1]}`];
    requireContract(JSON.stringify(parentNames.sort()) === JSON.stringify(expectedParent), "Exception dependency chain changed");
    requireContract(entry.via?.length === 1, "Additional advisory in exception chain");
    if (index < exception.chain.length - 1) {
      requireContract(entry.via[0] === exception.chain[index + 1], "Unexpected inherited advisory");
    } else {
      const advisory = entry.via[0];
      requireContract(typeof advisory === "object" && advisory.url === exception.advisory
        && advisory.name === "braces" && advisory.dependency === "braces"
        && advisory.severity === "high" && advisory.range === "<=3.0.3"
        && advisory.cwe?.length === 1 && advisory.cwe[0] === "CWE-674", "Advisory identity/scope changed");
    }
  }
  return { accepted: severe.length, high: counts.high, critical: counts.critical };
}

export function verifyUpstreamVersion(version) {
  requireContract(typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version), "Invalid upstream braces version");
  const parts = version.split(".").map(Number);
  requireContract(parts[0] < 3 || (parts[0] === 3 && parts[1] === 0 && parts[2] <= 3),
    "Upstream braces patch available; remove/review exception and update dependencies");
}

function npmJson(args) {
  const result = spawnSync(process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32" ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args, {
      encoding: "utf8", timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
    });
  requireContract(!result.error && [0, 1].includes(result.status), "npm registry command failed");
  let value;
  try { value = JSON.parse(result.stdout); } catch { throw new Error("Invalid npm registry JSON"); }
  requireContract(!value?.error, "npm registry request unavailable");
  return value;
}

function main() {
  // Only fixed internal argument arrays reach cmd.exe on Windows; never user/env input.
  const report = npmJson(["audit", "--json"]);
  const summary = verifyAudit(report, JSON.parse(readFileSync("package-lock.json", "utf8")));
  if (summary.accepted) verifyUpstreamVersion(npmJson(["view", "braces", "version", "--json"]));
  console.log(`Full audit: High=${summary.high}, Critical=${summary.critical}; accepted entries=${summary.accepted}`);
  if (summary.accepted) console.log(`${exception.id}: ${exception.cve}, dev-only; expires ${exception.expires}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
