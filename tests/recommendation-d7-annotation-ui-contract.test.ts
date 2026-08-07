import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MVP_ASPECT_IDS } from "@/features/recommendations/evaluation/annotation-tool/domain/constants";
import { isEditableShortcutTarget, resolveAnnotationShortcut } from "@/features/recommendations/evaluation/annotation-tool/ui/shortcuts";
import { ASPECT_REGISTRY } from "@/features/recommendations/domain/aspect-registry";

const root = process.cwd();
const ui = readFileSync(path.join(root, "features/recommendations/evaluation/annotation-tool/ui/annotation-tool-client.tsx"), "utf8");
const page = readFileSync(path.join(root, "app/dev/recommendation-annotation/page.tsx"), "utf8");
const api = readFileSync(path.join(root, "app/api/dev/recommendation-annotation/route.ts"), "utf8");
const navigation = readFileSync(path.join(root, "components/app-shell/route-app-shell.tsx"), "utf8");
const taskPlan = readFileSync(path.join(root, "features/recommendations/evaluation/annotation-tool/ui/task-generation-plan.ts"), "utf8");

describe("D7-1A UI and shortcut contract", () => {
  it("default 12 aspect doğrudan 43-aspect registry'den gelir", () => {
    expect(DEFAULT_MVP_ASPECT_IDS).toHaveLength(12);
    for (const id of DEFAULT_MVP_ASPECT_IDS) expect(ASPECT_REGISTRY[id]).toBeDefined();
    expect(ui).not.toContain("const ASPECT");
  });

  it("Türkçe label ve confidence metinlerini gösterir, raw enum'u label olarak kullanmaz", () => {
    expect(ui).toContain("ANNOTATION_LABEL_UI");
    expect(ui).toContain("ANNOTATION_CONFIDENCE_UI");
  });

  it.each([
    ["1", "absent"], ["2", "incidental"], ["3", "significant"], ["4", "primary"], ["5", "insufficient_evidence"],
  ])("%s label shortcut'ını %s olarak çözer", (key, expected) => {
    expect(resolveAnnotationShortcut({ key, shiftKey: false, ctrlKey: false, metaKey: false })).toEqual({ kind: "label", value: expected });
  });

  it("Shift+1/2/3 confidence ve Ctrl+S/N/P navigation shortcut'larını çözer", () => {
    expect(resolveAnnotationShortcut({ key: "2", shiftKey: true, ctrlKey: false, metaKey: false })).toEqual({ kind: "confidence", value: "medium" });
    expect(resolveAnnotationShortcut({ key: "s", shiftKey: false, ctrlKey: true, metaKey: false })).toEqual({ kind: "save" });
    expect(resolveAnnotationShortcut({ key: "n", shiftKey: false, ctrlKey: false, metaKey: false })).toEqual({ kind: "next" });
    expect(resolveAnnotationShortcut({ key: "p", shiftKey: false, ctrlKey: false, metaKey: false })).toEqual({ kind: "previous" });
  });

  it("input/textarea/select/contenteditable içinde shortcut tetiklemez", () => {
    class FakeElement { isContentEditable = false; constructor(readonly tagName: string) {} }
    vi.stubGlobal("HTMLElement", FakeElement);
    expect(isEditableShortcutTarget(new FakeElement("INPUT") as unknown as EventTarget)).toBe(true);
    expect(isEditableShortcutTarget(new FakeElement("TEXTAREA") as unknown as EventTarget)).toBe(true);
    const content = new FakeElement("DIV"); content.isContentEditable = true;
    expect(isEditableShortcutTarget(content as unknown as EventTarget)).toBe(true);
    vi.unstubAllGlobals();
  });

  it("radio semantics, field labels, progress live region ve bounded notes taşır", () => {
    expect(ui).toContain('type="radio"');
    expect(ui).toContain('htmlFor="evidence-note"');
    expect(ui).toContain('aria-live="polite"');
    expect(ui).toContain("maxLength={280}");
  });

  it("responsive grid ve min-width korumalarıyla mobil yatay taşmayı önler", () => {
    expect(ui).toContain("grid min-w-0");
    expect(ui).toContain("lg:grid-cols-");
    expect(ui).toContain("break-words");
  });

  it("UI yalnız dev API read-model tüketir; filesystem/provider/model çağrısı yoktur", () => {
    expect(ui).toContain('const API = "/api/dev/recommendation-annotation"');
    expect(ui).not.toMatch(/node:fs|anilist|tvmaze|tmdb|omdb|openlibrary|modelVersion/i);
  });

  it("server page guard 404 ve API aynı shared guard'ı kullanır", () => {
    expect(page).toContain("annotationToolAccessForHost");
    expect(page).toContain("notFound()");
    expect(api).toContain("annotationApiGuard(request)");
  });

  it("route Node runtime, force-dynamic ve no-store response contract'ına bağlıdır", () => {
    expect(api).toContain('runtime = "nodejs"');
    expect(api).toContain('dynamic = "force-dynamic"');
    expect(api).toContain("annotationJson");
  });

  it("all-selected ve explicit sparse modlarını aynı mevcut generate_tasks action'ına gönderir", () => {
    expect(ui).toContain('mode: "all_selected"');
    expect(ui).toContain('mode: "explicit"');
    expect(ui).toContain('action: "generate_tasks"');
    expect(ui).toContain("Sparse task&apos;ları üret");
  });

  it("50 üstü all-selected üretim için açık checkbox confirmation ister", () => {
    expect(taskPlan).toContain("creatableTaskCount > 50");
    expect(ui).toContain('type="checkbox"');
    expect(ui).toContain("50&apos;den fazla");
    expect(ui).toContain("!allSelectedConfirmed");
  });

  it("sparse preview ayrı aksiyondur ve expected annotation label preselect etmez", () => {
    expect(ui).toContain("previewSparseTaskPlanJson");
    expect(ui).toContain('useState<AspectAnnotationLabel | null>(null)');
    expect(ui).toContain("!label || !assistanceMode || busy");
  });

  it("assistance mode explicit radio seçimi olmadan save'i açmaz", () => {
    expect(ui).toContain('useState<Exclude<AnnotationAssistanceMode, "unknown_legacy"> | null>(null)');
    expect(ui).toContain('value="independent_human"');
    expect(ui).toContain('value="assisted_human"');
    expect(ui).toContain("!assistanceMode || busy");
    expect(ui).toContain("assistanceMode,");
  });

  it("assistance tercihini yalnız sessionStorage enum değeri olarak hatırlar", () => {
    expect(ui).toContain("window.sessionStorage.getItem(ASSISTANCE_SESSION_KEY)");
    expect(ui).toContain("window.sessionStorage.setItem(ASSISTANCE_SESSION_KEY, value)");
    expect(ui).not.toContain("localStorage");
  });

  it("metadata reconcile salt-okunur preview ve ayrı explicit apply action'ı taşır", () => {
    expect(ui).toContain('action: "preview_reconcile"');
    expect(ui).toContain('action: "reconcile_workspace_metadata"');
    expect(ui).toContain("Backup al ve reconcile uygula");
  });

  it("annotation route ürün kabuğundan ayrıdır ve public navigation link'i değildir", () => {
    expect(navigation).toContain('pathname === "/dev/recommendation-annotation"');
    expect(navigation).not.toContain('href="/dev/recommendation-annotation"');
  });

  it("Recommendation V2 ve legacy ML importlarına dokunmaz", () => {
    const recommend = readFileSync(path.join(root, "app/api/ai/recommend/route.ts"), "utf8");
    expect(recommend).not.toContain("annotation-tool");
    expect(api).not.toMatch(/embedding|hybrid-scorer|deterministic-engine/);
  });
});
