/** Preserves the existing fbDatePreset behavior at its extracted boundary. */
export function fbDatePreset(days: number): string {
  return days <= 1
    ? "yesterday"
    : days <= 7
      ? "last_7d"
      : days <= 14
        ? "last_14d"
        : days <= 30
          ? "last_30d"
          : days <= 90
            ? "last_90d"
            : "maximum";
}
