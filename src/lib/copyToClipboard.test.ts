import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "./copyToClipboard";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toasts }));

/** Replaces `navigator.clipboard` for one test and returns how to put it back. */
function stubClipboard(clipboard: Pick<Clipboard, "writeText"> | undefined) {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
  });

  return () => {
    if (original) {
      Object.defineProperty(navigator, "clipboard", original);
    } else {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  toasts.success.mockClear();
  toasts.error.mockClear();
});

describe("copyToClipboard", () => {
  it("copies the text and confirms with the caller's message", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const restore = stubClipboard({ writeText });

    try {
      const copied = await copyToClipboard("abc", "הקישור הועתק", "פרטים");

      expect(copied).toBe(true);
      expect(writeText).toHaveBeenCalledWith("abc");
      expect(toasts.success).toHaveBeenCalledWith("הקישור הועתק", {
        description: "פרטים",
      });
    } finally {
      restore();
    }
  });

  it("reports a failure when the browser refuses the copy", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const restore = stubClipboard({
      writeText: vi.fn().mockRejectedValue(new Error("denied")),
    });

    try {
      const copied = await copyToClipboard("abc");

      expect(copied).toBe(false);
      expect(toasts.error).toHaveBeenCalledWith("ההעתקה נכשלה");
      expect(toasts.success).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it("reports a failure when the browser offers no clipboard", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const restore = stubClipboard(undefined);

    try {
      const copied = await copyToClipboard("abc");

      expect(copied).toBe(false);
      expect(toasts.error).toHaveBeenCalledWith("ההעתקה נכשלה");
    } finally {
      restore();
    }
  });
});
