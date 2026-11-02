import { expect, test } from "vitest";
import {
  leadOpenSurface,
  parseLeadViewMode,
  readStoredLeadViewMode,
  writeStoredLeadViewMode,
  LEAD_DEFAULT_VIEW_STORAGE_KEY,
  LEAD_VIEW_MODE_STORAGE_KEY,
} from "./leadViewMode.ts";

test("CRM table opens the chat record as a popup", () => {
  expect(leadOpenSurface("table")).toBe("popup");
  expect(leadOpenSurface("kanban")).toBe("chat");
  expect(leadOpenSurface("chat")).toBe("chat");
});

test("parseLeadViewMode accepts the three CRM views", () => {
  expect(parseLeadViewMode("kanban")).toBe("kanban");
  expect(parseLeadViewMode("table")).toBe("table");
  expect(parseLeadViewMode("chat")).toBe("chat");
  expect(parseLeadViewMode("pipeline")).toBe(null);
  expect(parseLeadViewMode(null)).toBe(null);
});

test("readStoredLeadViewMode prefers the saved default over last used", () => {
  const store = new Map<string, string>();
  const previous = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
  try {
    store.set(LEAD_VIEW_MODE_STORAGE_KEY, "chat");
    expect(readStoredLeadViewMode()).toBe("chat");
    store.set(LEAD_DEFAULT_VIEW_STORAGE_KEY, "table");
    expect(readStoredLeadViewMode()).toBe("table");
    writeStoredLeadViewMode("kanban", true);
    expect(store.get(LEAD_VIEW_MODE_STORAGE_KEY)).toBe("kanban");
    expect(store.get(LEAD_DEFAULT_VIEW_STORAGE_KEY)).toBe("kanban");
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = previous;
  }
});
