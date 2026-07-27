import type { StorageWriteResult } from "./local-data-storage";
import type { LocalOwnerScope } from "./local-owner-scope";
import {
  readPersonalData,
  writePersonalData,
  type PersonalDataCodec,
  type PersonalDataReadResult,
  type PersonalStorageLike,
} from "./personal-data-storage";

export interface MediaRecordRedirect {
  fromRecordId: string;
  toRecordId: string;
  operationId: string;
  createdAt: string;
}

export interface MediaRecordRedirectRegistry {
  version: 1;
  records: MediaRecordRedirect[];
}

export type RecordRedirectUpdateResult =
  | { ok: true; registry: MediaRecordRedirectRegistry }
  | { ok: false; code: "redirect_collision" | "redirect_cycle"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 220;
}

export const mediaRecordRedirectRegistryCodec: PersonalDataCodec<MediaRecordRedirectRegistry> = (
  value,
) => {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.records)) {
    return {
      ok: false,
      code: "redirect_registry_invalid",
      message: "Media record redirect registry formati gecersiz.",
    };
  }
  const records: MediaRecordRedirect[] = [];
  const fromIds = new Set<string>();
  for (const raw of value.records) {
    if (
      !isRecord(raw)
      || !validId(raw.fromRecordId)
      || !validId(raw.toRecordId)
      || raw.fromRecordId === raw.toRecordId
      || !validId(raw.operationId)
      || typeof raw.createdAt !== "string"
      || !Number.isFinite(Date.parse(raw.createdAt))
      || fromIds.has(raw.fromRecordId)
    ) {
      return {
        ok: false,
        code: "redirect_record_invalid",
        message: "Media record redirect kaydi gecersiz.",
      };
    }
    fromIds.add(raw.fromRecordId);
    records.push({
      fromRecordId: raw.fromRecordId,
      toRecordId: raw.toRecordId,
      operationId: raw.operationId,
      createdAt: raw.createdAt,
    });
  }
  if (records.some((entry) => fromIds.has(entry.toRecordId))) {
    const targets = new Map(records.map((entry) => [entry.fromRecordId, entry.toRecordId]));
    const hasCycle = records.some((entry) => {
      const seen = new Set<string>();
      let cursor: string | undefined = entry.fromRecordId;
      while (cursor && targets.has(cursor)) {
        if (seen.has(cursor)) return true;
        seen.add(cursor);
        cursor = targets.get(cursor);
      }
      return false;
    });
    if (!hasCycle) {
      const flattened = records.map((entry) => {
        let toRecordId = entry.toRecordId;
        const seen = new Set<string>();
        while (targets.has(toRecordId) && !seen.has(toRecordId)) {
          seen.add(toRecordId);
          toRecordId = targets.get(toRecordId)!;
        }
        return { ...entry, toRecordId };
      }).sort((left, right) =>
        left.fromRecordId.localeCompare(right.fromRecordId, "en"));
      return {
        ok: false,
        code: "redirect_chain",
        message: "Redirect chain dogrudan unique hedefe flatten edilmelidir.",
        repairData: {
          current: {
            version: 1,
            records: [...records].sort((left, right) =>
              left.fromRecordId.localeCompare(right.fromRecordId, "en")),
          },
          repaired: { version: 1, records: flattened },
        },
      };
    }
    return {
      ok: false,
      code: "redirect_cycle",
      message: "Redirect cycle registry'de saklanamaz.",
    };
  }
  return {
    ok: true,
    value: {
      version: 1,
      records: records.sort((left, right) =>
        left.fromRecordId.localeCompare(right.fromRecordId, "en")),
    },
  };
};

/** Yalnız integrity rollback/undo için repairable chain snapshot codec'i. */
export const mediaRecordRedirectRecoveryCodec: PersonalDataCodec<MediaRecordRedirectRegistry> = (
  value,
) => {
  const decoded = mediaRecordRedirectRegistryCodec(value);
  if (decoded.ok) return decoded;
  return decoded.code === "redirect_chain" && decoded.repairData
    ? { ok: true, value: decoded.repairData.current }
    : decoded;
};

export function emptyMediaRecordRedirectRegistry(): MediaRecordRedirectRegistry {
  return { version: 1, records: [] };
}

export function readMediaRecordRedirectRegistry(
  scope: LocalOwnerScope,
  storage?: PersonalStorageLike | null,
): PersonalDataReadResult<MediaRecordRedirectRegistry> {
  return readPersonalData(
    scope,
    "mediaRecordRedirects",
    mediaRecordRedirectRegistryCodec,
    storage,
  );
}

export function writeMediaRecordRedirectRegistry(
  scope: LocalOwnerScope,
  registry: MediaRecordRedirectRegistry,
  storage?: PersonalStorageLike | null,
): StorageWriteResult {
  return writePersonalData(
    scope,
    "mediaRecordRedirects",
    registry,
    mediaRecordRedirectRegistryCodec,
    storage,
  );
}

export function resolveMediaRecordRedirect(
  registry: MediaRecordRedirectRegistry,
  recordId: string,
): string {
  return registry.records.find((entry) => entry.fromRecordId === recordId)?.toRecordId
    ?? recordId;
}

export function buildMergedRecordRedirects(args: {
  current: MediaRecordRedirectRegistry;
  losingRecordIds: readonly string[];
  survivorRecordId: string;
  operationId: string;
  createdAt?: string;
}): RecordRedirectUpdateResult {
  const createdAt = args.createdAt ?? new Date().toISOString();
  const losing = new Set(args.losingRecordIds);
  if (losing.has(args.survivorRecordId)) {
    return { ok: false, code: "redirect_cycle", message: "Survivor kayip record listesinde olamaz." };
  }
  const existingSurvivorRedirect = args.current.records.find(
    (entry) => entry.fromRecordId === args.survivorRecordId,
  );
  if (existingSurvivorRedirect) {
    return {
      ok: false,
      code: "redirect_collision",
      message: "Survivor record zaten baska bir record'a redirect ediliyor.",
    };
  }

  const next = new Map<string, MediaRecordRedirect>();
  for (const entry of args.current.records) {
    const target = losing.has(entry.toRecordId) ? args.survivorRecordId : entry.toRecordId;
    next.set(entry.fromRecordId, { ...entry, toRecordId: target });
  }
  for (const recordId of losing) {
    const existing = next.get(recordId);
    if (existing && existing.toRecordId !== args.survivorRecordId) {
      return {
        ok: false,
        code: "redirect_collision",
        message: `${recordId} record redirect'i baska bir survivor'a ait.`,
      };
    }
    next.set(recordId, {
      fromRecordId: recordId,
      toRecordId: args.survivorRecordId,
      operationId: args.operationId,
      createdAt,
    });
  }
  const records = [...next.values()];
  const fromIds = new Set(records.map((entry) => entry.fromRecordId));
  if (records.some((entry) => fromIds.has(entry.toRecordId))) {
    return {
      ok: false,
      code: "redirect_cycle",
      message: "Redirect flattening sonrasinda chain veya cycle kaldi.",
    };
  }
  return {
    ok: true,
    registry: {
      version: 1,
      records: records.sort((left, right) =>
        left.fromRecordId.localeCompare(right.fromRecordId, "en")),
    },
  };
}
