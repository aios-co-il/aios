import type { KeyboardEvent } from "react";

const STEPS: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

/**
 * Radio-group arrow keys: picks the next or previous option, wrapping around,
 * and moves focus to it (the option with `data-radio-value`). Returns the
 * picked value, or null for any other key.
 */
export function selectWithArrows(
  event: KeyboardEvent<HTMLElement>,
  values: Array<string>,
  current: string | null,
): string | null {
  const step = STEPS[event.key];
  if (!step || values.length === 0) {
    return null;
  }
  event.preventDefault();
  // Move from the option that has focus (the group's Tab stop when none is picked).
  const focused =
    event.target instanceof HTMLElement
      ? event.target.closest<HTMLElement>("[data-radio-value]")
      : null;
  const base = focused?.dataset.radioValue ?? current;
  const index = base ? values.indexOf(base) : -1;
  const next = values[(index + step + values.length) % values.length];
  event.currentTarget
    .querySelector<HTMLElement>(`[data-radio-value="${CSS.escape(next)}"]`)
    ?.focus();
  return next;
}
