import { leadSourceMatches } from "../_shared/lead-source/source-key.ts";

/** Lead fields that hold the arrival source as sent ("FB", "Facebook Ads"…). */
const SOURCE_FIELDS = new Set(["source", "first_source"]);

/**
 * Whether a condition step's field value equals the configured value. A lead
 * source compares by its fixed key, so "FB" equals a condition on "paid_ads"
 * the way it did when the source was stored as the key.
 */
export function fieldValueEquals(
  field: string,
  actual: string,
  expected: string,
): boolean {
  return SOURCE_FIELDS.has(field)
    ? leadSourceMatches(expected, actual)
    : actual === expected;
}

/**
 * The switch branch that names the same lead source as `actual`, for a value
 * no branch spells exactly; undefined for other fields or when none matches.
 */
export function sourceBranch(
  field: string,
  actual: string,
  branches: readonly string[],
): string | undefined {
  if (!SOURCE_FIELDS.has(field)) {
    return undefined;
  }
  return branches.find((branch) => leadSourceMatches(branch, actual));
}
