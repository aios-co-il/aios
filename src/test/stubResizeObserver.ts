import { vi } from "vitest";

/** Gives jsdom a no-op ResizeObserver, which the shared pages' charts construct on mount. */
export function stubResizeObserver(): void {
  if (!("ResizeObserver" in globalThis)) {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  }
}
