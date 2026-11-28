import { describe, expect, it } from "vitest";
import { CARMEN_APP_STORAGE_KEY, isCarmenAppWebView } from "./carmenAppWebView";

/** A sessionStorage stand-in. */
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    values,
  };
}

describe("isCarmenAppWebView", () => {
  it("is the app on the page the app opened, and the tab remembers it", () => {
    const storage = memoryStorage();

    expect(isCarmenAppWebView("?carmen_app=1", storage)).toBe(true);

    expect(storage.values.get(CARMEN_APP_STORAGE_KEY)).toBe("1");
    expect(isCarmenAppWebView("", storage)).toBe(true);
  });

  it("is not the app in an ordinary browser tab", () => {
    const storage = memoryStorage();

    expect(isCarmenAppWebView("?tab=chat", storage)).toBe(false);
    expect(isCarmenAppWebView("?carmen_app=0", storage)).toBe(false);
    expect(storage.values.size).toBe(0);
  });

  it("counts the flagged page even where storage is refused", () => {
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };

    expect(isCarmenAppWebView("?carmen_app=1", refusing)).toBe(true);
    expect(isCarmenAppWebView("", refusing)).toBe(false);
    expect(isCarmenAppWebView("", null)).toBe(false);
  });
});
