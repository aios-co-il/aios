import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearStaleScreenshots } from "./clearStaleScreenshots";

describe("clearStaleScreenshots", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("removes the old screenshot keys and keeps everything else", () => {
    localStorage.setItem("report-screenshot-123", "x".repeat(1000));
    localStorage.setItem("dashboard-screenshot-abc", "x".repeat(1000));
    localStorage.setItem("sb-api-auth-token", "session");
    localStorage.setItem("my-report-screenshot-1", "kept");

    const removed = clearStaleScreenshots(localStorage);

    expect(removed).toBe(2);
    expect(localStorage.getItem("report-screenshot-123")).toBeNull();
    expect(localStorage.getItem("dashboard-screenshot-abc")).toBeNull();
    expect(localStorage.getItem("sb-api-auth-token")).toBe("session");
    expect(localStorage.getItem("my-report-screenshot-1")).toBe("kept");
  });

  it("frees room for the Supabase session in a full storage", () => {
    const store = quotaStorage(10);
    store.setItem("report-screenshot-1", "x".repeat(8));
    expect(() => store.setItem("sb-api-auth-token", "token")).toThrow(/quota/);

    clearStaleScreenshots(store);
    store.setItem("sb-api-auth-token", "token");

    expect(store.getItem("sb-api-auth-token")).toBe("token");
  });

  it("runs before main.tsx loads the Supabase client", () => {
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");
    const imports = [...main.matchAll(/^import .*?["'](.+?)["'];$/gm)].map(
      (match) => match[1],
    );

    expect(imports[0]).toBe("./clearStaleScreenshots.ts");
  });

  it("logs and carries on when storage is blocked", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const blocked = {
      get length(): number {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;

    expect(clearStaleScreenshots(blocked)).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});

/** A Storage that throws like a browser once its values exceed `limit` characters. */
function quotaStorage(limit: number): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      const used = [...values.values()].reduce((n, v) => n + v.length, 0);

      if (used - (values.get(key)?.length ?? 0) + value.length > limit) {
        throw new DOMException("exceeded the quota", "QuotaExceededError");
      }
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}
