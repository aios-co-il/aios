import type { PulseTarget } from "../../../../supabase/functions/_shared/pulse/targets/kinds.ts";

/** The typed target value: a positive number, null when empty, else "invalid". */
export function parseDraft(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "invalid";
}

/** Where an inherited target comes from; it cannot be edited or removed here. */
export function inheritedFrom(
  target: PulseTarget | null,
  ownScope: PulseTarget["scope"],
): string | null {
  if (!target || target.scope === ownScope) {
    return null;
  }
  if (target.scope === "platform") {
    return "מהפלטפורמה";
  }
  return "מהגדרות הדוח";
}
