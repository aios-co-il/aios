import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadFacebookSdk,
  type FacebookSdk,
  type FacebookWindow,
} from "./facebookSdk";

const win: FacebookWindow = window;
const options = {
  appId: "app-490",
  cookie: true,
  xfbml: false,
  version: "v24.0",
};

beforeEach(() => {
  delete win.FB;
  delete win.fbAsyncInit;
  document.body.innerHTML = "";
  // Never insert an external script into the DOM or execute the real Meta SDK.
  vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete win.FB;
  delete win.fbAsyncInit;
  document.body.innerHTML = "";
});

describe("loadFacebookSdk", () => {
  it("initializes an already loaded SDK with its own receiver before resolving", async () => {
    const { sdk, init } = createSdk();
    win.FB = sdk;
    await loadFacebookSdk(options.appId, options.version);
    expect(init).toHaveBeenCalledExactlyOnceWith(options);
    expect(init.mock.contexts[0]).toBe(sdk);
    expect(document.body.appendChild).not.toHaveBeenCalled();
  });

  it.each(["property", "extracted"])(
    "initializes through a delayed %s callback without relying on this",
    async (invocation) => {
      const { sdk, init } = createSdk();
      const loading = loadFacebookSdk(options.appId, options.version);
      const callback = getCallback();
      const settled = vi.fn();
      const completion = loading.then(settled);
      await Promise.resolve();
      expect(settled).not.toHaveBeenCalled();
      win.FB = sdk;
      if (invocation === "property") {
        win.fbAsyncInit?.();
      } else {
        callback();
      }
      expect(init).toHaveBeenCalledExactlyOnceWith(options);
      expect(init.mock.contexts[0]).toBe(sdk);
      expect(settled).not.toHaveBeenCalled();
      await completion;
      expect(settled).toHaveBeenCalledOnce();
    },
  );

  it("reads the current SDK when a global is replaced before initialization", async () => {
    const first = createSdk();
    const replacement = createSdk();
    const loading = loadFacebookSdk(options.appId, options.version);
    win.FB = first.sdk;
    win.FB = replacement.sdk;
    getCallback()();
    await loading;
    expect(first.init).not.toHaveBeenCalled();
    expect(replacement.init).toHaveBeenCalledExactlyOnceWith(options);
  });

  it("rejects a missing SDK without throwing out of the delayed callback", async () => {
    const loading = loadFacebookSdk(options.appId, options.version);
    const rejected = expect(loading).rejects.toThrow("Meta SDK לא נטען");
    expect(() => getCallback()()).not.toThrow();
    await rejected;
  });

  it.each(["loaded", "delayed"])(
    "rejects the same initialization error on the %s path",
    async (path) => {
      const { sdk, init } = createSdk();
      const error = new Error("SDK init failed");
      init.mockImplementation(() => {
        throw error;
      });
      if (path === "loaded") {
        win.FB = sdk;
      }
      const loading = loadFacebookSdk(options.appId, options.version);
      const rejected = expect(loading).rejects.toBe(error);
      if (path === "delayed") {
        win.FB = sdk;
        expect(() => getCallback()()).not.toThrow();
      }
      await rejected;
    },
  );

  it("preserves the script attributes and rejects its error event", async () => {
    const loading = loadFacebookSdk(options.appId, options.version);
    const rejected = expect(loading).rejects.toThrow(
      "לא ניתן לטעון את Meta SDK",
    );
    const appended = vi.mocked(document.body.appendChild).mock.calls[0]?.[0];
    if (!(appended instanceof HTMLScriptElement)) {
      throw new Error("Missing SDK script");
    }
    expect(appended.id).toBe("facebook-jssdk");
    expect(appended.src).toBe("https://connect.facebook.net/en_US/sdk.js");
    expect([appended.async, appended.defer, appended.crossOrigin]).toEqual([
      true,
      true,
      "anonymous",
    ]);
    appended.dispatchEvent(new Event("error"));
    await rejected;
  });

  it("waits for the callback without appending a duplicate existing script", async () => {
    document.body.innerHTML = '<script id="facebook-jssdk"></script>';
    const { sdk } = createSdk();
    const loading = loadFacebookSdk(options.appId, options.version);
    expect(document.body.appendChild).not.toHaveBeenCalled();
    win.FB = sdk;
    getCallback()();
    await loading;
  });
});

/** Supply the SDK's actual callable shape without any network implementation. */
function createSdk() {
  const init = vi.fn<FacebookSdk["init"]>();
  const sdk: FacebookSdk = { init, login: vi.fn<FacebookSdk["login"]>() };
  return { sdk, init };
}

/** Fail clearly if the loader did not install its zero-argument callback. */
function getCallback() {
  const callback = win.fbAsyncInit;
  if (!callback) {
    throw new Error("SDK callback missing");
  }
  return callback;
}
