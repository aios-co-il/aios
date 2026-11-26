/**
 * What a used step keeps on its row once the run has used it (AIO-656), in place of its
 * result: the read's snapshot id and refs, and whether a click or type changed the page.
 * Neither holds anything the page wrote. A later click or type is checked against it
 * (act-target.ts).
 */
import type { AnyToolResult } from "../../_shared/carmen/device-result-check.ts";

/** What a used step keeps in place of its result. */
export type StepResidue =
  { snapshot_id: string; refs: Array<string> } | { changed: boolean };

/** What a used step keeps for later checks: a read's snapshot and refs, a click's or type's `changed`. */
export function stepResidue(
  tool: string,
  result: AnyToolResult,
): StepResidue | null {
  if (tool === "browser_read_page" && "elements" in result) {
    return {
      snapshot_id: result.snapshot_id,
      refs: result.elements.map((element) => element.ref),
    };
  }
  return "changed" in result ? { changed: result.changed } : null;
}

/** A read's kept snapshot id and refs, or null when the row keeps something else. */
export function keptSnapshot(
  value: unknown,
): { snapshot_id: string; refs: Array<string> } | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("snapshot_id" in value) ||
    typeof value.snapshot_id !== "string" ||
    !("refs" in value) ||
    !Array.isArray(value.refs)
  ) {
    return null;
  }
  const refs = value.refs.filter(
    (ref): ref is string => typeof ref === "string",
  );

  return refs.length === value.refs.length
    ? { snapshot_id: value.snapshot_id, refs }
    : null;
}
