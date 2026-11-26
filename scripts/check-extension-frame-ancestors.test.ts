import { describe, expect, test } from "vitest";

import {
  EXTENSION_PUBLIC_KEYS,
  extensionId,
  extensionOrigins,
} from "../extension/build/extensionKey.ts";
import { frameAncestorsPolicy } from "./check-extension-frame-ancestors.ts";

describe("check-extension-frame-ancestors", () => {
  test("an id is the key's hash in Chrome's a-to-p alphabet", () => {
    // A throwaway key and the id Chromium 158 gave an unpacked extension that carried it.
    const sampleKey =
      "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv3tCn9Jh0NBHMunlZcSaliPa07tZIgXVhMpoiUbLzwh+KLW6ll/lDTTIzozE1/9JEF0kEdIvA5YO/d42Mgzv6ki/2dqZgpH90FIAkXJ01sukkNkN01wpZATmaUaU3aBxsPgzzW0QCgYjT4Nx67kKs2Ig1ICwEfQco7WB5HXR4TJH0slVNqclPir49H5jQVuXg/F9BKxGwtU4+GcMYLE0v1l5CYavoiznMl6ESoIW2m1OjevK967STnVWmI9AfYkfetsI4fMJoC54sXWjnJsPRZLLeQuqm5ztKYiEk5Ap0xYtGDbcSZNqfxvz0fkKMx9+ERGB6Db1iGQVE29ec60dOwIDAQAB";

    expect(extensionId(sampleKey)).toBe("mpiigdchhilnkefpekkcfdoknpdokdoj");
    expect(new Set(extensionOrigins()).size).toBe(
      Object.keys(EXTENSION_PUBLIC_KEYS).length,
    );
  });

  test("the policy names the site itself and each extension origin", () => {
    expect(frameAncestorsPolicy(["chrome-extension://abc"])).toBe(
      "frame-ancestors 'self' chrome-extension://abc",
    );
  });
});
