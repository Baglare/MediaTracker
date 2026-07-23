import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("owner-scoped library integration contract", () => {
  const hook = readFileSync("hooks/use-media-library.ts", "utf8");
  const page = readFileSync("app/page.tsx", "utf8");
  const recommendationAdapter = readFileSync(
    "lib/recommendation-library-adapter.ts",
    "utf8",
  );

  it("keeps auth-pending distinct from guest", () => {
    expect(page).toContain("authLoading ? undefined : user?.id ?? null");
    expect(hook).toContain("if (!scope) return");
  });

  it("masks old owner state and rejects stale hydration work", () => {
    expect(hook).toContain("isHydratedOwnerVisible(scopeKey, hydratedScopeKey)");
    expect(hook).toContain("isCurrentOwnerGeneration(generation");
    expect(hook).toContain("setMediaList([])");
    expect(hook).toContain("setSyncOwnerScope(null)");
  });

  it("uses only scoped storage for active hook persistence", () => {
    expect(hook).toContain("loadScopedMediaList(scope)");
    expect(hook).toContain("loadScopedProgressLogs(scope)");
    expect(hook).toContain("saveScopedLibrarySnapshot(");
    expect(hook).not.toContain("loadMediaList()");
    expect(hook).not.toContain("saveLibrarySnapshot(");
  });

  it("keeps demo data out of authenticated XP/social flush gates", () => {
    expect(hook).toContain('datasetOrigin === "demo"');
    expect(hook).toContain("materializeDemoDatasetMutation");
  });

  it("keeps recommendation writes on the same scoped persistence path", () => {
    expect(recommendationAdapter).toContain("loadScopedMediaList(scope)");
    expect(recommendationAdapter).toContain("saveScopedLibrarySnapshot(");
    expect(recommendationAdapter).not.toContain("localStorage");
  });
});
