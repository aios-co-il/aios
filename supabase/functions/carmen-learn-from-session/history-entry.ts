export type HistoryEntry = {
  role?: unknown;
  direction?: unknown;
  content?: unknown;
  message?: unknown;
  text?: unknown;
};

export function readHistoryEntry(raw: unknown): HistoryEntry {
  return typeof raw === "object" && raw !== null ? raw : {};
}
