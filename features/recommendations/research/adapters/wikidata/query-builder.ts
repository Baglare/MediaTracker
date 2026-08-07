import type { WikidataExternalIdentityCandidate } from "../types";

export const WIKIDATA_QUERY_LIMIT = 2;

export function escapeSparqlExactLiteral(value: string): string {
  if (!value || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("wikidata_external_id_literal_invalid");
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildExactWikidataQuery(candidate: WikidataExternalIdentityCandidate): string {
  if (!/^P[1-9]\d*$/.test(candidate.propertyId)) throw new Error("wikidata_property_not_allowlisted");
  const literal = escapeSparqlExactLiteral(candidate.externalId);
  return `SELECT ?item WHERE { ?item wdt:${candidate.propertyId} "${literal}". } LIMIT ${WIKIDATA_QUERY_LIMIT}`;
}

export function buildExactWikidataQueryUrl(candidate: WikidataExternalIdentityCandidate): string {
  const url = new URL("https://query.wikidata.org/sparql");
  url.searchParams.set("query", buildExactWikidataQuery(candidate));
  url.searchParams.set("format", "json");
  return url.toString();
}

export function buildWikidataEntityUrl(entityId: string): string {
  if (!/^Q[1-9]\d*$/.test(entityId)) throw new Error("wikidata_qid_invalid");
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("ids", entityId);
  url.searchParams.set("props", "claims|sitelinks|info");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  return url.toString();
}

