import { ANNOTATION_TOOL_LIMITS } from "@/features/recommendations/evaluation/annotation-tool/domain/constants";
import { annotationApiGuard, annotationJson } from "@/features/recommendations/evaluation/annotation-tool/server/access";
import { AnnotationToolService, mapAnnotationServiceError } from "@/features/recommendations/evaluation/annotation-tool/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function service() {
  return new AnnotationToolService();
}

async function readBoundedJson(request: Request): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > ANNOTATION_TOOL_LIMITS.requestBytes) throw new Error("payload_too_large");
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > ANNOTATION_TOOL_LIMITS.requestBytes) throw new Error("payload_too_large");
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("malformed_json"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("malformed_json");
  return parsed as Record<string, unknown>;
}

export async function GET(request: Request) {
  const denied = annotationApiGuard(request);
  if (denied) return denied;
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("workspaceId");
    return annotationJson(id ? await service().read(id) : await service().list());
  } catch (error) {
    const mapped = mapAnnotationServiceError(error);
    return annotationJson({ error: mapped.message }, mapped.status);
  }
}

export async function POST(request: Request) {
  const denied = annotationApiGuard(request);
  if (denied) return denied;
  try {
    const input = await readBoundedJson(request);
    const action = input.action;
    const api = service();
    const result = action === "create_workspace" ? await api.create(input)
      : action === "preview_import" ? await api.previewImport(input)
        : action === "apply_import" ? await api.applyImport(input)
          : action === "generate_tasks" ? await api.generateTasks(input)
            : action === "save_annotation" ? await api.saveAnnotation(input)
              : action === "adjudicate" ? await api.adjudicate(input)
                : action === "revoke" ? await api.revoke(input)
                  : action === "validate" ? await api.validate(input)
                    : action === "export" ? await api.export(input)
                      : action === "backup" ? await api.backup(input)
                        : action === "change_status" ? await api.changeStatus(input)
                          : (() => { throw new Error("unknown_action"); })();
    return annotationJson(result);
  } catch (error) {
    const mapped = mapAnnotationServiceError(error);
    return annotationJson({ error: mapped.message }, mapped.status);
  }
}
