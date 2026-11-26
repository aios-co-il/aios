/**
 * Reads what a panel reports as a tool's result. The report is untrusted: it is stored and
 * later shown to the model only when it has exactly the fields of the tool's result type
 * (`_shared/carmen/device/results.ts`), each within its limit. A result over a limit is
 * refused, not cut: the panel cuts to the same limits before it reports. An extra field is
 * refused too, so text typed into a page or a field's value has nowhere to travel. Text
 * PostgreSQL cannot store (a NUL, half of a surrogate pair) is refused here, where the
 * panel gets `invalid_result`, instead of failing the write.
 *
 * carmen-device-action checks a report before it stores it, and run-ai-agent checks the
 * stored result again before the model sees it. Outside `device/` because it uses
 * `String.prototype.isWellFormed`, which the extension's TypeScript target lacks, and the
 * extension type-checks that whole folder.
 */
import { type DeviceToolName, isDeviceToolName } from "./device/contract.ts";
import {
  type DeviceToolResult,
  PAGE_ELEMENT_FIELD_MAX,
  type PageElement,
  type PageLocation,
  READ_PAGE_ELEMENTS_MAX,
  READ_PAGE_TEXT_MAX,
  RESULT_FIELD_MAX,
} from "./device/results.ts";
import { WEB_PROTOCOLS } from "./screen-context.ts";

type Check = (value: unknown) => boolean;

/** One check per field of a shape, so a field added to a result type needs its check here. */
type Checks<Shape> = { [Field in keyof Shape]-?: Check };

export type AnyToolResult = DeviceToolResult[DeviceToolName];

const LOCATION: Checks<PageLocation> = { origin: isWebOrigin, path: isPath };

const ELEMENT: Checks<PageElement> = {
  ref: textUpTo(PAGE_ELEMENT_FIELD_MAX),
  role: textUpTo(PAGE_ELEMENT_FIELD_MAX),
  name: textUpTo(PAGE_ELEMENT_FIELD_MAX),
};

/** Any address: `isPath` only asks how a URL parser writes the path after it. */
const PATH_BASE = "https://page.invalid";

/** The Command Center's rule for a stored file's name: letters, digits, dot, dash, underscore; never only dots. */
const STORED_FILE_NAME = /^(?!\.+$)[a-zA-Z0-9._-]+$/;

/**
 * The reported result when it fits the result type of the action's tool, else null.
 * `userId` is the action's user: a file a result names must be in their own folder.
 */
export function toolResult(
  tool: string,
  value: unknown,
  userId: string,
): AnyToolResult | null {
  if (!isDeviceToolName(tool)) {
    return null;
  }
  const checks: Checks<AnyToolResult> = resultChecks(userId)[tool];

  return fits(value, checks) ? value : null;
}

/** The reported tab address when it is a web origin and a path, else null. */
export function pageLocation(value: unknown): PageLocation | null {
  return fits(value, LOCATION) ? value : null;
}

/** The checks of every tool's result, for an action of this user. */
function resultChecks(userId: string): {
  [Tool in DeviceToolName]: Checks<DeviceToolResult[Tool]>;
} {
  return {
    browser_read_page: {
      ...LOCATION,
      snapshot_id: textUpTo(RESULT_FIELD_MAX),
      title: textUpTo(RESULT_FIELD_MAX),
      elements: isElementList,
      text: textUpTo(READ_PAGE_TEXT_MAX),
    },
    browser_navigate: { ...LOCATION, title: textUpTo(RESULT_FIELD_MAX) },
    browser_click: LOCATION,
    browser_type: LOCATION,
    browser_screenshot: { ...LOCATION, storage_path: ownFilePath(userId) },
  };
}

/** Whether the value is an object with exactly the checked fields, each passing its check. */
function fits<Shape>(value: unknown, checks: Checks<Shape>): value is Shape {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const fields = Object.entries<Check>(checks);
  const reported = new Map(Object.entries(value));

  return (
    reported.size === fields.length &&
    fields.every(
      ([field, check]) => reported.has(field) && check(reported.get(field)),
    )
  );
}

/**
 * A check for a string of at most `max` characters that a jsonb column can hold: no NUL,
 * and no surrogate without its pair, which is what cutting text through an emoji leaves.
 */
function textUpTo(max: number): Check {
  return (value) =>
    typeof value === "string" &&
    value.length <= max &&
    value.isWellFormed() &&
    !value.includes("\u0000");
}

/**
 * A check for a file in this user's own folder of the private bucket, `<user id>/<file
 * name>`, as the Command Center stores uploads. The server later reads and deletes the
 * file with the service role, so a path into another folder must never be stored.
 */
function ownFilePath(userId: string): Check {
  const folder = `${userId}/`;

  return (value) =>
    typeof value === "string" &&
    value.length <= RESULT_FIELD_MAX &&
    value.startsWith(folder) &&
    STORED_FILE_NAME.test(value.slice(folder.length));
}

/** An http or https origin exactly as `URL.origin` writes it: no path, credentials or query. */
function isWebOrigin(value: unknown): boolean {
  if (typeof value !== "string" || value.length > RESULT_FIELD_MAX) {
    return false;
  }
  const address = URL.canParse(value) ? new URL(value) : null;

  return (
    address !== null &&
    WEB_PROTOCOLS.includes(address.protocol) &&
    address.origin === value
  );
}

/**
 * A path exactly as a URL parser writes one: no query or fragment, which may carry tokens,
 * and nothing a parser would rewrite (`..`, a backslash, a raw space or NUL). A path that
 * starts `//` is refused too: joined to its origin with `new URL(path, origin)` it would
 * name another host, and a later check would look at the wrong site.
 */
function isPath(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.length <= RESULT_FIELD_MAX &&
    !value.startsWith("//") &&
    URL.canParse(PATH_BASE + value) &&
    new URL(PATH_BASE + value).pathname === value
  );
}

/** At most the allowed number of elements, each a ref, a role and a name. */
function isElementList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= READ_PAGE_ELEMENTS_MAX &&
    value.every((element) => fits(element, ELEMENT))
  );
}
