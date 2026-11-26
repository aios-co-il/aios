/**
 * The fields Carmen never types into: passwords, payment cards, one-time codes and file
 * pickers. The panel asks before it types and refuses when any hint says so.
 */

/** What the page says about a field. All of it is written by the page, so it is best effort. */
export type FieldFacts = {
  /** The `type` attribute of an input. */
  type?: string | null;
  autocomplete?: string | null;
  /** Any text that names the field: its name, id, label and placeholder. */
  names?: ReadonlyArray<string | null | undefined>;
};

export type FieldNeverReason = "file" | "password" | "card" | "one_time_code";

/**
 * Why Carmen never types into this field, or null. Any one hint refuses and none can
 * allow: a field named "comment" with `type="password"` is still a password field.
 */
export function fieldNeverReason(facts: FieldFacts): FieldNeverReason | null {
  const type = (facts.type ?? "").trim().toLowerCase();
  const autocomplete = (facts.autocomplete ?? "").toLowerCase().split(/\s+/);
  const names = (facts.names ?? []).join(" ").toLowerCase();

  if (type === "file") {
    return "file";
  }
  if (
    type === "password" ||
    autocomplete.some((token) => token.endsWith("password")) ||
    PASSWORD_NAME.test(names)
  ) {
    return "password";
  }
  if (
    autocomplete.some((token) => token.startsWith("cc-")) ||
    CARD_NAME.test(names)
  ) {
    return "card";
  }

  return autocomplete.includes("one-time-code") || CODE_NAME.test(names)
    ? "one_time_code"
    : null;
}

// Substrings on purpose: a name glued to its neighbours (`userOtp`, `newPasswordField`)
// must still match, and a harmless field refused by mistake costs only a typed word.
const PASSWORD_NAME = /passw|passcode|passphrase|pwd|סי?סמ/;
const CARD_NAME =
  /(?:card|cc)[-_ ]?(?:number|num|no|exp|cvc|cvv|csc)|credit[-_ ]?card|cvv|cvc|expir|security[-_ ]?code|אשראי|כרטיס|תוקף/;
const CODE_NAME =
  /otp|totp|2fa|mfa|one[-_ ]?time|verification[-_ ]?code|קוד אימות|קוד חד|קוד sms/;
