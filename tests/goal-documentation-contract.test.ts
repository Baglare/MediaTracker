import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("D5 documentation consolidation", () => {
  it("links every Goal contract to the consolidated architecture", () => {
    for (const path of [
      "docs/GOAL_SYSTEM_DOMAIN.md",
      "docs/GOAL_SYSTEM_LOCAL_PERSISTENCE.md",
      "docs/GOAL_SYSTEM_EVALUATION.md",
      "docs/GOAL_SYSTEM_CLOUD_SYNC.md",
      "docs/PORTABLE_BACKUP_FORMAT.md",
    ]) {
      expect(read(path), path).toContain("GOAL_SYSTEM_ARCHITECTURE.md");
    }
    const architecture = read("docs/GOAL_SYSTEM_ARCHITECTURE.md");
    expect(architecture).toContain("GOAL_SYSTEM_MANUAL_TESTS.md");
    expect(architecture).toContain("GOAL_SYSTEM_DEMO_SCRIPT.md");
  });

  it("keeps derived Goal state out of persistence and rollout claims", () => {
    const architecture = read("docs/GOAL_SYSTEM_ARCHITECTURE.md");
    expect(architecture).toContain("Evaluation hiçbir store, backup veya Cloud payload'ına yazılmaz");
    expect(architecture).toContain("production'a uygulanmamıştır");
    expect(architecture.toLowerCase()).not.toContain("production-ready");
  });

  it("records D5 as locally verified while keeping production cutover in D8", () => {
    const roadmap = read("docs/ROADMAP.md");
    const readme = read("README.md");
    expect(roadmap).toContain("D5 — Hedef sistemi");
    expect(roadmap).toContain("D8 — Release ve deployment");
    expect(roadmap).toContain("Goal Cloud V1 production migration/flag rollout");
    expect(readme).toContain("D1–D5");
    expect(readme).toContain("D8");
  });
});
