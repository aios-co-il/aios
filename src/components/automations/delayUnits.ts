/** The units a delay step can wait in; the engine reads the same values. */
export const DELAY_UNITS = [
  { value: "minutes", label: "דקות" },
  { value: "hours", label: "שעות" },
  { value: "days", label: "ימים" },
  { value: "weeks", label: "שבועות" },
];

/** The Hebrew label of a stored delay unit; minutes when none is stored. */
export function delayUnitLabel(unit: string | undefined): string {
  return (
    DELAY_UNITS.find((option) => option.value === unit)?.label ??
    DELAY_UNITS[0].label
  );
}
