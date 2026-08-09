import { decodeStrictUtf8 } from "../../network/response-limits";

const QID_PATTERN = /^Q[1-9]\d*$/;

export interface WikidataQueryCodecResult {
  entityIds: readonly string[];
  warnings: readonly string[];
}

export interface WikidataEntityCodecResult {
  entityId: string;
  externalIds: readonly string[];
  sitelinks: Readonly<Partial<Record<"enwiki" | "trwiki", string>>>;
  otherSitelinkKeys: readonly string[];
  lastRevisionId?: string;
  modified?: string;
  warnings: readonly string[];
}

function parseObject(bytes: Uint8Array): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeStrictUtf8(bytes));
  } catch {
    throw new Error("wikimedia_json_invalid");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("wikimedia_json_object_required");
  const object = parsed as Record<string, unknown>;
  if (object.error && typeof object.error === "object") throw new Error("wikimedia_api_error");
  return object;
}

export function decodeWikidataQueryResponse(bytes: Uint8Array): WikidataQueryCodecResult {
  const root = parseObject(bytes);
  const results = root.results;
  if (!results || typeof results !== "object" || Array.isArray(results)) throw new Error("wikidata_results_missing");
  const bindings = (results as Record<string, unknown>).bindings;
  if (!Array.isArray(bindings)) throw new Error("wikidata_bindings_missing");
  const entityIds = new Set<string>();
  const warnings: string[] = [];
  for (const row of bindings) {
    if (!row || typeof row !== "object" || Array.isArray(row)) { warnings.push("wikidata_binding_malformed"); continue; }
    const item = (row as Record<string, unknown>).item;
    const value = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>).value : undefined;
    const match = typeof value === "string" ? /^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d*)$/.exec(value) : null;
    if (!match) { warnings.push("wikidata_binding_qid_invalid"); continue; }
    entityIds.add(match[1]);
  }
  return { entityIds: [...entityIds].sort(), warnings: [...new Set(warnings)] };
}

function stringClaimValues(claims: unknown, propertyId: string, warnings: string[]): string[] {
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new Error("wikidata_claims_missing");
  const propertyClaims = (claims as Record<string, unknown>)[propertyId];
  if (!Array.isArray(propertyClaims)) return [];
  const values: string[] = [];
  for (const statement of propertyClaims) {
    const mainsnak = statement && typeof statement === "object" && !Array.isArray(statement) ? (statement as Record<string, unknown>).mainsnak : undefined;
    const datavalue = mainsnak && typeof mainsnak === "object" && !Array.isArray(mainsnak) ? (mainsnak as Record<string, unknown>).datavalue : undefined;
    const value = datavalue && typeof datavalue === "object" && !Array.isArray(datavalue) ? (datavalue as Record<string, unknown>).value : undefined;
    if (typeof value === "string") values.push(value);
    else warnings.push("wikidata_property_snak_drift");
  }
  return [...new Set(values)];
}

export function decodeWikidataEntityResponse(input: { bytes: Uint8Array; entityId: string; propertyId: string }): WikidataEntityCodecResult {
  if (!QID_PATTERN.test(input.entityId) || !/^P[1-9]\d*$/.test(input.propertyId)) throw new Error("wikidata_entity_codec_input_invalid");
  const root = parseObject(input.bytes);
  const entities = root.entities;
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) throw new Error("wikidata_entities_missing");
  const entity = (entities as Record<string, unknown>)[input.entityId];
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) throw new Error("wikidata_entity_missing");
  const object = entity as Record<string, unknown>;
  if (object.missing !== undefined) throw new Error("wikidata_entity_missing");
  const id = object.id;
  if (id !== input.entityId) throw new Error("wikidata_entity_id_mismatch");
  const warnings: string[] = [];
  const externalIds = stringClaimValues(object.claims, input.propertyId, warnings);
  const sitelinksObject = object.sitelinks && typeof object.sitelinks === "object" && !Array.isArray(object.sitelinks)
    ? object.sitelinks as Record<string, unknown> : {};
  const sitelinks: Partial<Record<"enwiki" | "trwiki", string>> = {};
  for (const project of ["enwiki", "trwiki"] as const) {
    const raw = sitelinksObject[project];
    const title = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).title : undefined;
    if (typeof title === "string" && title.trim() && title.length <= 240) sitelinks[project] = title.trim();
    else if (raw !== undefined) warnings.push(`wikidata_sitelink_shape_drift:${project}`);
  }
  const allOtherSitelinkKeys = Object.keys(sitelinksObject).filter((key) => key !== "enwiki" && key !== "trwiki").sort();
  const otherSitelinkKeys = allOtherSitelinkKeys.slice(0, 32);
  if (allOtherSitelinkKeys.length > otherSitelinkKeys.length) warnings.push("wikidata_other_sitelinks_truncated");
  const lastrevid = object.lastrevid;
  const modified = object.modified;
  return {
    entityId: input.entityId,
    externalIds,
    sitelinks,
    otherSitelinkKeys,
    ...(typeof lastrevid === "number" && Number.isInteger(lastrevid) && lastrevid > 0 ? { lastRevisionId: String(lastrevid) } : {}),
    ...(typeof modified === "string" && Number.isFinite(Date.parse(modified)) ? { modified } : {}),
    warnings: [...new Set(warnings)],
  };
}
