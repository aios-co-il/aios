/**
 * What a read leaves in the tab's isolated world for a later click or type, and what the
 * panel and the injected functions pass each other. The collector (pageCollector.ts) writes
 * the snapshot, the acting function (pageAct.ts) reads it; neither may import code, so the
 * shapes and the constants they are passed live here.
 */
import type { FieldFacts } from "../../../supabase/functions/_shared/carmen/device/field-rule.ts";

/** The isolated world's global the latest read's snapshot is kept under. */
export const PAGE_SNAPSHOT_KEY = "__carmenPageSnapshot";

/** The isolated world's global the click and typing events (pageInput.ts) are kept under. */
export const PAGE_INPUT_KEY = "__carmenPageInput";

/** The events of a click at the element's centre, and of typing into a field. */
export type PageInput = {
  click: (element: Element, hit: Element, rect: DOMRect) => void;
  type: (element: Element, text: string) => void;
};

/** What the panel passes the collector, so the injected source holds no constants of its own. */
export type CollectorLimits = {
  /** Stop collecting text past this many UTF-16 units; the panel cuts to the contract's limit. */
  textBudget: number;
  elementsMax: number;
  nameBudget: number;
  /** `PAGE_SNAPSHOT_KEY`. */
  snapshotKey: string;
  rules: typeof COLLECTOR_RULES;
};

/** Which elements the collector skips, lists and names by their content. */
export const COLLECTOR_RULES = {
  // Never read: form fields, custom input widgets and editable regions show what the user
  // typed; the rest is not text.
  skip: "script,style,noscript,template,head,input,textarea,select,option,datalist,[contenteditable]:not([contenteditable='false']),[role='textbox'],[role='searchbox'],[role='combobox'],[role='spinbutton']",
  actionable:
    "a[href],button,input:not([type='hidden']),select,textarea,[role='button'],[role='link'],[role='checkbox'],[role='radio'],[role='tab'],[role='menuitem'],[role='textbox'],[role='combobox'],[role='switch'],[contenteditable]:not([contenteditable='false'])",
  // A field's title may be set from its value by the page, so a text entry is never named by it.
  textEntryRoles: ["textbox", "searchbox", "combobox", "spinbutton"],
  namedByContent: ["link", "button", "tab", "menuitem"],
};

/** How the collector names an element; kept with the snapshot so a click names it the same way. */
export type PageReader = {
  isVisible: (element: Element) => boolean;
  roleOf: (element: Element) => string;
  nameOf: (element: Element, role: string) => string;
};

/** What the isolated world keeps of the latest read: `elements[i]` is the element of ref `e<i+1>`. */
export type KeptSnapshot = {
  id: string;
  elements: Array<Element>;
  /** Each element's role and name as the read reported them. */
  described: Array<{ role: string; name: string }>;
  /** A reader with empty caches, so a later check sees the page as it is then. */
  reader: () => PageReader;
};

/** One run of the function. */
export type PageActRequest = {
  snapshotKey: string;
  /** `PAGE_INPUT_KEY`. */
  inputKey: string;
  snapshotId: string;
  /** The element's position in the read's list (`refIndex`). */
  index: number;
  tool: "browser_click" | "browser_type";
  /** Absent before the card; after the tap, the fingerprint the card was drawn from. */
  expected?: string;
  /** The text to type, after the tap only. */
  text?: string;
  rules: typeof ACT_RULES;
};

/** What the acting function counts as a text field, and which elements it reads as fields. */
export const ACT_RULES = {
  textTypes: ["", "text", "search", "email", "url", "tel", "number"],
  fields:
    "input,textarea,select,[contenteditable]:not([contenteditable='false'])",
};

/** What the card is drawn from and the panel's rules decide on. */
export type PageTarget = {
  role: string;
  name: string;
  field: FieldFacts;
  /** A field typing can fill: a text input, a text area or an editable region, not disabled or read-only. */
  textEntry: boolean;
  /** A link's address or a submit button's form address, for the card; else null. */
  destination: string | null;
  /** For typing: every field of the page, so a password or card field anywhere refuses it. */
  pageFields: Array<FieldFacts>;
  fingerprint: string;
};

/** Why the element is no longer the one the read listed, or no longer actionable. */
export type TargetChange =
  "gone" | "detached" | "renamed" | "hidden" | "covered" | "moved" | "not_text";

export type PageActAnswer =
  | { kind: "target"; target: PageTarget }
  | { kind: "acted" }
  | { kind: "changed"; reason: TargetChange };
