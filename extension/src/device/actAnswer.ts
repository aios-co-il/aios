/**
 * The acting function's answer as the panel receives it from `executeScript`: untrusted
 * until it has the function's shape, like the collector's (collectedPage.ts).
 */
import type { FieldFacts } from "../../../supabase/functions/_shared/carmen/device/field-rule.ts";
import type {
  PageActAnswer,
  PageTarget,
  TargetChange,
} from "./keptSnapshot.ts";

const CHANGES: ReadonlyArray<string> = [
  "gone",
  "detached",
  "renamed",
  "hidden",
  "covered",
  "moved",
  "not_text",
] satisfies Array<TargetChange>;

/** The answer, or null unless it has one of the function's shapes. */
export function actAnswer(value: unknown): PageActAnswer | null {
  if (!value || typeof value !== "object" || !("kind" in value)) {
    return null;
  }
  if (value.kind === "acted") {
    return { kind: "acted" };
  }
  if (value.kind === "changed") {
    return "reason" in value && isChange(value.reason)
      ? { kind: "changed", reason: value.reason }
      : null;
  }
  const target =
    value.kind === "target" && "target" in value
      ? pageTarget(value.target)
      : null;
  return target ? { kind: "target", target } : null;
}

/** Narrows a reason to a known change. */
function isChange(value: unknown): value is TargetChange {
  return typeof value === "string" && CHANGES.includes(value);
}

/** The described element, or null unless every field has its type. */
function pageTarget(value: unknown): PageTarget | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("role" in value) ||
    typeof value.role !== "string" ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !("field" in value) ||
    !isFieldFacts(value.field) ||
    !("textEntry" in value) ||
    typeof value.textEntry !== "boolean" ||
    !("destination" in value) ||
    (value.destination !== null && typeof value.destination !== "string") ||
    !("pageFields" in value) ||
    !Array.isArray(value.pageFields) ||
    !value.pageFields.every(isFieldFacts) ||
    !("fingerprint" in value) ||
    typeof value.fingerprint !== "string"
  ) {
    return null;
  }
  return {
    role: value.role,
    name: value.name,
    field: value.field,
    textEntry: value.textEntry,
    destination: value.destination,
    pageFields: value.pageFields,
    fingerprint: value.fingerprint,
  };
}

/** Narrows the facts of one field: a type, an autocomplete and names, each a string or null. */
export function isFieldFacts(value: unknown): value is FieldFacts {
  return (
    !!value &&
    typeof value === "object" &&
    "type" in value &&
    isText(value.type) &&
    "autocomplete" in value &&
    isText(value.autocomplete) &&
    "names" in value &&
    Array.isArray(value.names) &&
    value.names.every(isText)
  );
}

/** A string or null. */
function isText(value: unknown): boolean {
  return value === null || typeof value === "string";
}
