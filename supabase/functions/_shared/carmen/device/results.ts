/**
 * What each device tool reports back: stored on the action's row and shown to the model as
 * untrusted data. No result has a field for typed text or for the value of a form field:
 * what is typed stays between the action's row and the page, and what a page holds in its
 * inputs never leaves it.
 */
import type { DeviceToolName } from "./contract.ts";

export const READ_PAGE_ELEMENTS_MAX = 150;
export const READ_PAGE_TEXT_MAX = 6000;
/** The longest origin, path, title, snapshot id or storage path a result may carry, in characters. */
export const RESULT_FIELD_MAX = 2048;
/** The longest `ref`, `role` or `name` of one element, in characters. */
export const PAGE_ELEMENT_FIELD_MAX = 200;

/** Where the tab was when the tool finished, as Chrome reports it; never the page's own claim. */
export type PageLocation = { origin: string; path: string };

/**
 * An element a later click or type names by `ref`. The page writes `role` and `name`, so
 * they describe and never decide: no rule reads them to allow an action.
 */
export type PageElement = { ref: string; role: string; name: string };

/** The page as read: its visible text and actionable elements, each cut to the limits above. */
export type PageSnapshot = PageLocation & {
  snapshot_id: string;
  title: string;
  elements: Array<PageElement>;
  text: string;
};

/** The result of each tool in `DEVICE_TOOLS`, by tool name. */
export type DeviceToolResult = ResultOfEveryTool<{
  browser_read_page: PageSnapshot;
  browser_navigate: PageLocation & { title: string };
  browser_click: PageLocation;
  /** Where the text went; never the text. */
  browser_type: PageLocation;
  /**
   * The picture's path in the user's private folder; the server describes it and deletes
   * the file. Provisional: the screenshot PR of AIO-656 settles this field.
   */
  browser_screenshot: PageLocation & { storage_path: string };
}>;

/** Fails to compile when a tool in `DEVICE_TOOLS` has no result here. */
type ResultOfEveryTool<Results extends Record<DeviceToolName, object>> =
  Results;
