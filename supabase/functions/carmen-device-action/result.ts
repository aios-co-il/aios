/**
 * Reads what a panel reports as a tool's result. The report is untrusted: it is stored and
 * later shown to the model only when it has exactly the fields of the tool's result type
 * (`_shared/carmen/device/results.ts`), each within its limit. A result over a limit is
 * refused, not cut: the panel cuts to the same limits before it reports. An extra field is
 * refused too, so text typed into a page or a field's value has nowhere to travel.
 */
import {
  type DeviceToolName,
  isDeviceToolName,
} from "../_shared/carmen/device/contract.ts";
import {
  type DeviceToolResult,
  PAGE_ELEMENT_FIELD_MAX,
  type PageElement,
  type PageLocation,
  READ_PAGE_ELEMENTS_MAX,
  READ_PAGE_TEXT_MAX,
  RESULT_FIELD_MAX,
} from "../_shared/carmen/device/results.ts";
import { WEB_PROTOCOLS } from "../_shared/carmen/screen-context.ts";

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

const RESULT_CHECKS: {
  [Tool in DeviceToolName]: Checks<DeviceToolResult[Tool]>;
} = {
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
  browser_screenshot: {
    ...LOCATION,
    storage_path: textUpTo(RESULT_FIELD_MAX),
  },
};

/** The reported result when it fits the tool's result type, else null. */
export function toolResult(tool: string, value: unknown): AnyToolResult | null {
  if (!isDeviceToolName(tool)) {
    return null;
  }
  const checks: Checks<AnyToolResult> = RESULT_CHECKS[tool];

  return fits(value, checks) ? value : null;
}

/** The reported tab address when it is a web origin and a path, else null. */
export function pageLocation(value: unknown): PageLocation | null {
  return fits(value, LOCATION) ? value : null;
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

/** A check for a string of at most `max` characters. */
function textUpTo(max: number): Check {
  return (value) => typeof value === "string" && value.length <= max;
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

/** A path without its query or fragment, which may carry tokens. */
function isPath(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    value.length <= RESULT_FIELD_MAX &&
    !/[?#]/.test(value)
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
