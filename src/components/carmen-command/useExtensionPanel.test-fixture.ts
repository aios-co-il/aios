import { act } from "@testing-library/react";
import { vi } from "vitest";

/** Stands in for the window that frames the page; records what the page posts to it. */
export function frameThePage(parentOrigin: string | undefined) {
  const parent = { postMessage: vi.fn() };

  vi.spyOn(window, "parent", "get").mockReturnValue(
    parent as unknown as Window,
  );
  Object.defineProperty(window.location, "ancestorOrigins", {
    configurable: true,
    value: parentOrigin ? [parentOrigin] : undefined,
  });

  return parent;
}

/** Delivers a message to the page as the browser would. */
export function deliver(data: unknown, origin: string, source: unknown) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin,
        source: source as MessageEventSource,
      }),
    );
  });
}
