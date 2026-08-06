export const WORKSPACE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;
export const BOUNDED_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_.:-]{1,118}[a-z0-9])?$/;
export const ANNOTATOR_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;

export function isValidWorkspaceId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 3
    && value.length <= 48
    && WORKSPACE_ID_PATTERN.test(value)
    && !value.includes("..");
}

export function isValidBoundedId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 3
    && value.length <= 120
    && BOUNDED_ID_PATTERN.test(value)
    && !value.includes("..");
}

export function isValidAnnotatorId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 3
    && value.length <= 32
    && ANNOTATOR_ID_PATTERN.test(value)
    && !value.includes("..");
}
