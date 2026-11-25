import { describe, expect, it, vi } from "vitest";

import {
  readSidePanelCollapsed,
  sidePanelStorageKey,
  writeSidePanelCollapsed,
} from "./sidePanelStorage";

describe("side panel storage", () => {
  it("starts collapsed when nothing is saved", () => {
    const storage = { getItem: () => null };

    expect(readSidePanelCollapsed(storage, "tasks")).toBe(true);
  });

  it("keeps each module's state under its own key", () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    };

    writeSidePanelCollapsed(storage, "clients", false);

    expect(saved.get(sidePanelStorageKey("clients"))).toBe("open");
    expect(readSidePanelCollapsed(storage, "clients")).toBe(false);
    expect(readSidePanelCollapsed(storage, "leads")).toBe(true);
  });

  it("falls back to collapsed when storage throws", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readSidePanelCollapsed(storage, "tasks")).toBe(true);
    expect(() =>
      writeSidePanelCollapsed(storage, "tasks", false),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
