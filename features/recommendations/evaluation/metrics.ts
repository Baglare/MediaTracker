export interface PrecisionRecallF1 { precision: number; recall: number; f1: number }
export function precisionRecallF1(tp: number, fp: number, fn: number): PrecisionRecallF1 {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return { precision, recall, f1: precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall) };
}
export function rate(numerator: number, denominator: number): number { return denominator === 0 ? 0 : numerator / denominator; }
export const constraintExtractionPrecisionRecallF1 = precisionRecallF1;
export function hardConstraintViolationRate(results: readonly { returned: boolean; hardConstraintPass: boolean }[]): number {
  const returned = results.filter((item) => item.returned);
  return rate(returned.filter((item) => !item.hardConstraintPass).length, returned.length);
}
export function precisionAtK(relevance: readonly number[], k: number, threshold = 2): number {
  const selected = relevance.slice(0, Math.max(0, k));
  return rate(selected.filter((grade) => grade >= threshold).length, selected.length);
}
export function recallAtK(relevance: readonly number[], totalRelevant: number, k: number, threshold = 2): number {
  return rate(relevance.slice(0, Math.max(0, k)).filter((grade) => grade >= threshold).length, totalRelevant);
}
export function ndcgAtK(relevance: readonly number[], k: number): number {
  const dcg = (values: readonly number[]) => values.reduce((sum, grade, index) => sum + (2 ** grade - 1) / Math.log2(index + 2), 0);
  const selected = relevance.slice(0, Math.max(0, k));
  const ideal = [...relevance].sort((a, b) => b - a).slice(0, Math.max(0, k));
  const idealScore = dcg(ideal);
  return idealScore === 0 ? 0 : dcg(selected) / idealScore;
}
export function meanOrdinalError(expected: readonly number[], actual: readonly number[]): number {
  const count = Math.min(expected.length, actual.length);
  return count === 0 ? 0 : expected.slice(0, count).reduce((sum, value, index) => sum + Math.abs(value - actual[index]), 0) / count;
}
export function aspectLevelAccuracy(expected: readonly string[], actual: readonly string[]): number {
  const count = Math.min(expected.length, actual.length);
  return count === 0 ? 0 : rate(expected.slice(0, count).filter((value, index) => value === actual[index]).length, count);
}
export function aspectPrecision(predictions: readonly { supported: boolean }[]): number { return rate(predictions.filter((item) => item.supported).length, predictions.length); }
export function unsupportedExplanationRate(claims: readonly { supported: boolean }[]): number { return rate(claims.filter((item) => !item.supported).length, claims.length); }
export function hallucinatedOrUnverifiedTitleRate(results: readonly { verifiedIdentity: boolean }[]): number { return rate(results.filter((item) => !item.verifiedIdentity).length, results.length); }
export function providerCoverage(results: readonly { provider: string; verified: boolean }[], expectedProviders: readonly string[]): number {
  const expected = [...new Set(expectedProviders)];
  if (expected.length === 0) return 0;
  const covered = new Set(results.filter((item) => item.verified).map((item) => item.provider));
  return rate(expected.filter((provider) => covered.has(provider)).length, expected.length);
}
export function duplicateRate(keys: readonly string[]): number { return rate(keys.length - new Set(keys).size, keys.length); }
export function categoricalDiversity(values: readonly string[]): number { return rate(new Set(values).size, values.length); }
export const franchiseDiversity = categoricalDiversity;
export const mediaTypeDiversity = categoricalDiversity;
export function fallbackRate(results: readonly { fallbackUsed: boolean }[]): number { return rate(results.filter((item) => item.fallbackUsed).length, results.length); }
export function verifierUsageRate(results: readonly { verifierUsed: boolean }[]): number { return rate(results.filter((item) => item.verifierUsed).length, results.length); }
export function resultCoverage(cases: readonly { expectedEmpty: boolean; resultCount: number }[]): number {
  const requiringResults = cases.filter((item) => !item.expectedEmpty);
  return rate(requiringResults.filter((item) => item.resultCount > 0).length, requiringResults.length);
}
export function latencySummary(values: readonly number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const percentile = (p: number) => sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return { count: sorted.length, mean: sorted.length === 0 ? 0 : sorted.reduce((sum, value) => sum + value, 0) / sorted.length, p50: percentile(0.5), p95: percentile(0.95), max: sorted.at(-1) ?? 0 };
}
