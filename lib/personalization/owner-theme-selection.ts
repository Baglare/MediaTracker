import type { StorageWriteResult } from "../local-data-storage";
import type { LocalOwnerScope } from "../local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "../personal-data-storage";
import type { ThemeSelection } from "./types";
import { normalizeThemeSelection } from "./validation";

export interface OwnerThemeSelectionState {
  version: 1;
  selection: ThemeSelection | null;
}

export const ownerThemeSelectionCodec: PersonalDataCodec<OwnerThemeSelectionState> = (
  value,
) => {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || (value as { version?: unknown }).version !== 1
  ) {
    return { ok: false, message: "Owner theme selection formati gecersiz." };
  }
  const rawSelection = (value as { selection?: unknown }).selection;
  if (rawSelection === null || rawSelection === undefined) {
    return { ok: true, value: { version: 1, selection: null } };
  }
  return {
    ok: true,
    value: { version: 1, selection: normalizeThemeSelection(rawSelection) },
  };
};

export function readOwnerThemeSelection(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike,
): PersonalDataReadResult<OwnerThemeSelectionState> {
  return readPersonalData(scope, "themeSelection", ownerThemeSelectionCodec, storage);
}

export function writeOwnerThemeSelection(
  scope: LocalOwnerScope,
  selection: ThemeSelection | null,
  storage?: PersonalStorageLike,
): StorageWriteResult {
  return writePersonalData(
    scope,
    "themeSelection",
    { version: 1, selection },
    ownerThemeSelectionCodec,
    storage,
  );
}
