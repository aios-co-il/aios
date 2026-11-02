import { format } from "date-fns";

/** `dd/MM/yyyy HH:mm` in the viewer's time zone; empty for a missing or unreadable value. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "dd/MM/yyyy HH:mm");
}
