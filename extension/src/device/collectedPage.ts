/**
 * The page collector's answer as the panel receives it from `executeScript`: untrusted
 * until it has the collector's shape.
 */
import type { CollectedPage } from "./pageCollector.ts";

/** The collector's answer, read as untrusted: null unless it has the collector's shape. */
export function readCollectedPage(value: unknown): CollectedPage | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("origin" in value) ||
    typeof value.origin !== "string" ||
    !("text" in value) ||
    typeof value.text !== "string" ||
    !("elements" in value) ||
    !Array.isArray(value.elements)
  ) {
    return null;
  }
  const elements = value.elements.filter(isCollectedElement);

  return elements.length === value.elements.length
    ? {
        origin: value.origin,
        text: value.text,
        elements: elements.map(({ role, name }) => ({ role, name })),
      }
    : null;
}

/** Narrows one collected element: a role and a name, both strings. */
function isCollectedElement(
  value: unknown,
): value is CollectedPage["elements"][number] {
  return (
    !!value &&
    typeof value === "object" &&
    "role" in value &&
    typeof value.role === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}
