import { describe, expect, it } from "vitest";
import { applyGridPreset, defaultProfileModules, mergeModuleDefaults, moveModule, normalizeResponsiveModules, reflowModules } from "@/lib/social/grid";
import { validateModuleLayout } from "@/lib/social/validation";

const base = defaultProfileModules()[0];

describe("social profile grid", () => {
  it("accepts valid coordinates", () => {
    expect(validateModuleLayout(base).ok).toBe(true);
  });

  it.each([
    { gridX: -1 }, { gridY: -1 }, { gridWidth: 13 }, { gridWidth: 0 }, { gridHeight: 0 }, { gridHeight: 7 },
    { gridX: 8, gridWidth: 6 }, { mobileOrder: -1 }, { moduleKey: "unknown" },
  ])("rejects invalid layout %o", (override) => {
    expect(validateModuleLayout({ ...base, ...override }).ok).toBe(false);
  });

  it("keeps width preset inside the 12-column grid", () => {
    expect(applyGridPreset({ ...base, gridX: 8 }, "full")).toMatchObject({ gridX: 0, gridWidth: 12 });
    expect(applyGridPreset(base, "small").gridWidth).toBe(3);
  });

  it("normalizes mobile order without mutating inputs", () => {
    const modules = defaultProfileModules().slice(0, 3).map((module, index) => ({ ...module, mobileOrder: 9 - index }));
    const normalized = normalizeResponsiveModules(modules);
    expect(normalized.map((module) => module.mobileOrder)).toEqual([0, 1, 2]);
    expect(modules[0].mobileOrder).toBe(9);
  });

  it("supports keyboard up/down reordering", () => {
    const modules = defaultProfileModules().slice(0, 3);
    expect(moveModule(modules, modules[1].moduleKey, -1)[0].moduleKey).toBe(modules[1].moduleKey);
    expect(moveModule(modules, modules[0].moduleKey, -1)[0].moduleKey).toBe(modules[0].moduleKey);
  });

  it("reflows edited modules without overlap", () => {
    const modules = reflowModules(defaultProfileModules().slice(0, 3));
    expect(modules.map((module) => [module.gridX, module.gridY])).toEqual([[0, 0], [0, 2], [0, 4]]);
  });

  it("restores unknown or missing modules from safe defaults", () => {
    const merged = mergeModuleDefaults([{ ...base, gridWidth: 0 }]);
    expect(merged).toHaveLength(8);
    expect(merged[0].gridWidth).toBe(8);
  });
});
