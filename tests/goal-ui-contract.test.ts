import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("D5-2 Goal navigation and definition-only UI", () => {
  const page = read("features/goals/components/goals-page-client.tsx");
  const card = read("features/goals/components/goal-card.tsx");
  const form = read("features/goals/components/goal-form-dialog.tsx");

  it("adds the Hedefler route and lifecycle tabs", () => {
    const navigation = read("components/app-shell/app-navigation.ts");
    expect(navigation).toContain('id: "goals", label: "Hedefler"');
    expect(navigation).toContain('href: "/goals"');
    for (const label of ["Aktif hedefler", "İptal edilenler", "Arşivlenenler"]) expect(page).toContain(label);
    expect(page).toContain('role="tablist"');
    expect(page).toContain("<EmptyState");
  });

  it("supports create, edit and confirmed lifecycle/delete actions", () => {
    expect(page).toContain("<GoalFormDialog");
    expect(page).toContain("<ConfirmDialog");
    for (const operation of ["mutations.create", "mutations.update", "mutations.cancel", "mutations.archive", "mutations.reactivate", "mutations.delete"]) {
      expect(page).toContain(operation);
    }
  });

  it("renders only Goal definition fields and no fabricated evaluation", () => {
    for (const field of ["Kapsam", "Metrik", "Program", "Timezone", "lifecycle", "origin"]) expect(card).toContain(field);
    expect(card).toContain("Bağlı medya bulunamadı");
    expect(card).not.toContain("currentValue");
    expect(card).not.toContain("progressPercent");
    expect(card).not.toContain("progress bar");
    expect(page).not.toContain("currentValue");
  });

  it("associates form errors and preserves modal keyboard contracts", () => {
    expect(form).toContain('aria-describedby={errors.title ? "goal-title-error" : undefined}');
    expect(form).toContain('aria-describedby={errors.mediaRecordId ? "goal-media-error" : undefined}');
    expect(form).toContain('aria-describedby={errors.timeZone ? "goal-timezone-error" : undefined}');
    expect(form).toContain('event.key === "Escape"');
    expect(form).toContain('event.key !== "Tab"');
    expect(form).toContain("previouslyFocused?.focus()");
    expect(form).toContain("isValidIanaTimeZone(timeZone)");
  });

  it("uses exact media IDs and clears incompatible choices without fuzzy matching", () => {
    expect(form).toContain('{ kind: "media", mediaRecordId }');
    expect(form).toContain("progressUnitsForMediaType");
    expect(form).toContain('singleMediaCompletion ? "1"');
    expect(form).not.toContain("toLowerCase");
    expect(form).not.toContain("includes(item.title");
  });

  it("masks stale owner state and reads storage outside render", () => {
    const hook = read("features/goals/hooks/use-goals.ts");
    expect(hook).toContain("isHydratedOwnerVisible");
    expect(hook).toContain("isCurrentOwnerGeneration");
    expect(hook).toContain("queueMicrotask");
    expect(hook).toContain("subscribeGoalStore");
  });
});
