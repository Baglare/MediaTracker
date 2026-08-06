import type { AnnotationConfidence, AspectAnnotationLabel } from "../../dataset";

export type AnnotationShortcut =
  | { kind: "label"; value: AspectAnnotationLabel }
  | { kind: "confidence"; value: AnnotationConfidence }
  | { kind: "save" }
  | { kind: "next" }
  | { kind: "previous" };

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function resolveAnnotationShortcut(event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey">): AnnotationShortcut | null {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "s") return { kind: "save" };
  if (event.shiftKey && ["1", "2", "3"].includes(key)) {
    return { kind: "confidence", value: key === "1" ? "low" : key === "2" ? "medium" : "high" };
  }
  if (!event.shiftKey && ["1", "2", "3", "4", "5"].includes(key)) {
    const labels: AspectAnnotationLabel[] = ["absent", "incidental", "significant", "primary", "insufficient_evidence"];
    return { kind: "label", value: labels[Number(key) - 1] };
  }
  if (!event.ctrlKey && !event.metaKey && key === "n") return { kind: "next" };
  if (!event.ctrlKey && !event.metaKey && key === "p") return { kind: "previous" };
  return null;
}
