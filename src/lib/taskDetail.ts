import type { RecurrenceFrequency } from "@/lib/taskRecurrence";

const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = [
  "daily",
  "weekly",
  "monthly",
];

export const isRecurrenceFrequency = (
  value: unknown,
): value is RecurrenceFrequency =>
  RECURRENCE_FREQUENCIES.some((frequency) => frequency === value);

/** A task row with `recurrence_frequency` narrowed for `TaskDetailDialog` (unknown values become null). */
export function toTaskDetail<
  T extends { recurrence_frequency?: string | null },
>(
  task: T,
): Omit<T, "recurrence_frequency"> & {
  recurrence_frequency: RecurrenceFrequency | null;
} {
  const { recurrence_frequency, ...rest } = task;
  return {
    ...rest,
    recurrence_frequency: isRecurrenceFrequency(recurrence_frequency)
      ? recurrence_frequency
      : null,
  };
}
