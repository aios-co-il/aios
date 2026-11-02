import {
  inferLeadSource,
  leadSourceMatches,
} from "../_shared/lead-source/source-key.ts";

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
 * Whether a condition step's field value contains the configured text, in any
 * case. A lead source also counts by its fixed key, so `source contains
 * paid_ads` holds for a lead sent as "FB".
 */
export function fieldValueContains(
  field: string,
  actual: string,
  expected: string,
): boolean {
  const wanted = expected.toLowerCase();
  return conditionTexts(field, actual).some((text) =>
    text.toLowerCase().includes(wanted),
  );
}

/**
 * Whether a condition step's field value starts with the configured text. A
 * lead source also counts by its fixed key ("FB" starts with "paid").
 */
export function fieldValueStartsWith(
  field: string,
  actual: string,
  expected: string,
): boolean {
  return conditionTexts(field, actual).some((text) =>
    text.startsWith(expected),
  );
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

/** The texts a text condition reads: a lead source as sent and as its key. */
function conditionTexts(field: string, actual: string): string[] {
  return SOURCE_FIELDS.has(field)
    ? [actual, inferLeadSource(actual)]
    : [actual];
}
