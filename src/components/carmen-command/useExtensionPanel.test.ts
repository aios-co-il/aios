import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PANEL_MESSAGE,
  panelActionRef,
  panelCapabilities,
  panelClaimFailed,
  panelSignal,
  panelTabContext,
} from "@functions/_shared/carmen/device/panel-envelope.ts";
import { EXTENSION_ORIGINS } from "./extensionOrigins";
import { useExtensionPanel } from "./useExtensionPanel";

const PANEL_ORIGIN = EXTENSION_ORIGINS[0];
const TAB = {
  url: "https://example.com/pricing?coupon=1#top",
  title: "Pricing",
};

/** Stands in for the window that frames the page; records what the page posts to it. */
function frameThePage(parentOrigin: string | undefined) {
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
function deliver(data: unknown, origin: string, source: unknown) {
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

describe("useExtensionPanel: the shared tab", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let listen: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    listen = vi.spyOn(window, "addEventListener");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window.location, "ancestorOrigins");
  });

  it("the extension origins are the ones vercel.json lets frame the site", () => {
    expect(EXTENSION_ORIGINS.length).toBeGreaterThan(0);
    for (const origin of EXTENSION_ORIGINS) {
      expect(origin).toMatch(/^chrome-extension:\/\/[a-p]{32}$/);
    }
  });

  it("does nothing on the site itself", () => {
    const { result } = renderHook(() => useExtensionPanel().tabContext);

    deliver(panelTabContext(TAB), PANEL_ORIGIN, window);

    expect(result.current).toBeNull();
    expect(listen).not.toHaveBeenCalledWith("message", expect.anything());
  });

  it.each([
    ["another site", "https://evil.example.com"],
    ["an unknown extension", `chrome-extension://${"b".repeat(32)}`],
    ["a browser that does not name the framing origin", undefined],
  ])("does nothing when framed by %s", (_name, parentOrigin) => {
    const parent = frameThePage(parentOrigin);
    const { result } = renderHook(() => useExtensionPanel().tabContext);

    deliver(panelTabContext(TAB), parentOrigin ?? PANEL_ORIGIN, parent);

    expect(result.current).toBeNull();
    expect(parent.postMessage).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalledWith("message", expect.anything());
  });

  it("says hello to the panel, to its exact origin", () => {
    const parent = frameThePage(PANEL_ORIGIN);

    renderHook(() => useExtensionPanel().tabContext);

    expect(parent.postMessage).toHaveBeenCalledExactlyOnceWith(
      panelSignal(PANEL_MESSAGE.hello),
      PANEL_ORIGIN,
    );
  });

  it("keeps the latest tab the panel reports, cleaned", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result } = renderHook(() => useExtensionPanel().tabContext);

    deliver(panelSignal(PANEL_MESSAGE.ready), PANEL_ORIGIN, parent);
    deliver(panelCapabilities(), PANEL_ORIGIN, parent);
    expect(result.current).toBeNull();

    deliver(
      { type: PANEL_MESSAGE.tabContext, v: 1, tab: TAB },
      PANEL_ORIGIN,
      parent,
    );
    expect(result.current).toMatchObject({
      source: "browser_extension_tab",
      context_type: "browser_tab_context",
      url: "https://example.com/pricing",
      title: "Pricing",
    });

    deliver(panelTabContext(null), PANEL_ORIGIN, parent);
    expect(result.current).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("drops and logs a message from another origin or window", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result } = renderHook(() => useExtensionPanel().tabContext);

    deliver(panelTabContext(TAB), "https://evil.example.com", parent);
    deliver(panelTabContext(TAB), EXTENSION_ORIGINS[1], parent);
    deliver(panelTabContext(TAB), PANEL_ORIGIN, { postMessage: vi.fn() });

    expect(result.current).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("drops and logs a malformed message from the panel", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result } = renderHook(() => useExtensionPanel().tabContext);

    deliver(
      { type: PANEL_MESSAGE.tabContext, v: 2, tab: TAB },
      PANEL_ORIGIN,
      parent,
    );
    deliver(
      { type: "carmen:action", v: 1, click: "#pay" },
      PANEL_ORIGIN,
      parent,
    );

    expect(result.current).toBeNull();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("ignores other scripts' messages without a log line", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    renderHook(() => useExtensionPanel().tabContext);

    deliver({ source: "react-devtools" }, window.location.origin, window);

    expect(warn).not.toHaveBeenCalled();
    expect(parent.postMessage).toHaveBeenCalledOnce();
  });

  it("stops listening when the chat closes", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result, unmount } = renderHook(
      () => useExtensionPanel().tabContext,
    );

    unmount();
    deliver(panelTabContext(TAB), PANEL_ORIGIN, parent);

    expect(result.current).toBeNull();
  });
});

describe("useExtensionPanel: browser steps", () => {
  const ACTION_ID = "4f0c2a8e-1b2c-4d3e-8f90-123456789abc";

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window.location, "ancestorOrigins");
  });

  it("has no panel on the site itself", () => {
    const { result } = renderHook(() => useExtensionPanel());

    deliver(panelCapabilities(["browser_read_page"]), PANEL_ORIGIN, window);

    expect(result.current.panel).toBeNull();
  });

  it("has no panel when framed by another site", () => {
    const parent = frameThePage("https://evil.example.com");
    const { result } = renderHook(() => useExtensionPanel());

    deliver(
      panelCapabilities(["browser_read_page"]),
      "https://evil.example.com",
      parent,
    );

    expect(result.current.panel).toBeNull();
  });

  it("offers a tool only once the panel's capabilities name it, and drops it when they stop", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result } = renderHook(() => useExtensionPanel());

    expect(result.current.panel?.tools).toEqual([]);
    deliver(
      panelCapabilities(["tab-context", "browser_read_page"]),
      PANEL_ORIGIN,
      parent,
    );
    expect(result.current.panel?.tools).toEqual(["browser_read_page"]);

    deliver(panelCapabilities(["tab-context"]), PANEL_ORIGIN, parent);
    expect(result.current.panel?.tools).toEqual([]);
  });

  it("ignores capabilities from another origin or window", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result } = renderHook(() => useExtensionPanel());

    deliver(
      panelCapabilities(["browser_read_page"]),
      "https://evil.example.com",
      parent,
    );
    deliver(panelCapabilities(["browser_read_page"]), PANEL_ORIGIN, {
      postMessage: vi.fn(),
    });

    expect(result.current.panel?.tools).toEqual([]);
  });

  it("posts action and cancel to the panel's exact origin, carrying the id only", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result } = renderHook(() => useExtensionPanel());

    result.current.panel?.postAction(ACTION_ID);
    result.current.panel?.postCancel(ACTION_ID);

    expect(parent.postMessage).toHaveBeenCalledWith(
      panelActionRef(PANEL_MESSAGE.action, ACTION_ID),
      PANEL_ORIGIN,
    );
    expect(parent.postMessage).toHaveBeenLastCalledWith(
      panelActionRef(PANEL_MESSAGE.cancel, ACTION_ID),
      PANEL_ORIGIN,
    );
  });

  it("hands a result to its listeners only from the panel, and stops after unsubscribe", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result } = renderHook(() => useExtensionPanel());
    const listener = vi.fn();
    const unsubscribe = result.current.panel?.onResult(listener);
    const resultMessage = panelActionRef(PANEL_MESSAGE.result, ACTION_ID);

    deliver(resultMessage, "https://evil.example.com", parent);
    deliver(resultMessage, PANEL_ORIGIN, { postMessage: vi.fn() });
    deliver(resultMessage, EXTENSION_ORIGINS[1], parent);
    expect(listener).not.toHaveBeenCalled();

    deliver(resultMessage, PANEL_ORIGIN, parent);
    expect(listener).toHaveBeenCalledExactlyOnceWith(ACTION_ID);

    unsubscribe?.();
    deliver(resultMessage, PANEL_ORIGIN, parent);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("hands a failed claim and its reason to its listeners only from the panel", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result } = renderHook(() => useExtensionPanel());
    const listener = vi.fn();
    result.current.panel?.onClaimFailed(listener);
    const failed = panelClaimFailed(ACTION_ID, "refused");

    deliver(failed, "https://evil.example.com", parent);
    expect(listener).not.toHaveBeenCalled();

    deliver(failed, PANEL_ORIGIN, parent);
    expect(listener).toHaveBeenCalledExactlyOnceWith(ACTION_ID, "refused");
  });

  it("treats an action message from the panel as nothing", () => {
    const parent = frameThePage(PANEL_ORIGIN);
    const { result } = renderHook(() => useExtensionPanel());
    const listener = vi.fn();
    result.current.panel?.onResult(listener);

    deliver(
      panelActionRef(PANEL_MESSAGE.action, ACTION_ID),
      PANEL_ORIGIN,
      parent,
    );

    expect(listener).not.toHaveBeenCalled();
    expect(parent.postMessage).toHaveBeenCalledOnce();
  });
});
