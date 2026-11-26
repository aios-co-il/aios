/**
 * The destination of a `browser_navigate`, as the model wrote it. The server checks it
 * before it writes the step, and the panel checks the claimed arguments again before it
 * draws the card, so both read the same address the same way. Whether the destination may
 * be opened at all is the card rule's (`card-rule.ts`); this only says it is an address.
 */
import { parseWebAddress } from "./never-controllable.ts";
import { RESULT_FIELD_MAX } from "./results.ts";

/**
 * The destination as one address, written as `URL.href` writes it, or null when the
 * arguments are not exactly `{url}` with an http or https address of at most
 * `RESULT_FIELD_MAX` characters, a host and no credentials (`https://aios.co.il@evil.test`
 * names one site and opens another).
 */
export function navigateDestination(args: unknown): string | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }
  const entries = Object.entries(args);
  const url = entries.length === 1 && "url" in args ? args.url : null;
  if (typeof url !== "string" || url.length > RESULT_FIELD_MAX) {
    return null;
  }

  const address = parseWebAddress(url.trim());
  if (
    !address ||
    !address.hostname ||
    address.username ||
    address.password ||
    address.href.length > RESULT_FIELD_MAX
  ) {
    return null;
  }
  return address.href;
}
