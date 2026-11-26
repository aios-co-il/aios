import { describe, expect, it } from "vitest";
import {
  isAiosImageAddress,
  projectOriginOf,
  type AiosAddressConfig,
} from "./replyImageSource";
import {
  JWT_PUBLISHABLE_KEY,
  OPAQUE_PUBLISHABLE_KEY,
  PROJECT_ORIGIN,
  publishableKey,
} from "./replyImageSource.test-fixture";

/** Production's shape: the app talks to the custom domain (docs/ENVIRONMENTS.md). */
const PRODUCTION: AiosAddressConfig = {
  supabaseUrl: "https://api.aios.co.il",
  publishableKey: JWT_PUBLISHABLE_KEY,
  appOrigin: "https://app.aios.co.il",
};

/** The app talks to the project's own address, with a key that names no project. */
const DIRECT: AiosAddressConfig = {
  supabaseUrl: PROJECT_ORIGIN,
  publishableKey: OPAQUE_PUBLISHABLE_KEY,
  appOrigin: "http://localhost:8080",
};

describe("isAiosImageAddress", () => {
  describe("addresses AIOS serves", () => {
    it.each([
      [
        "a chat attachment's signed link (commandCenterAttachments)",
        "https://api.aios.co.il/storage/v1/object/sign/command-center-files/user-1/1764150000000-brief.png?token=eyJhbGciOiJIUzI1NiJ9.e30.sig",
      ],
      [
        "a creative's signed link (resolveCreativeImageUrl)",
        "https://api.aios.co.il/storage/v1/object/sign/entity-attachments/tenant-1/creative.png?token=abc",
      ],
      [
        "a generated picture's public link, written by an edge function on the supabase.co address",
        `${PROJECT_ORIGIN}/storage/v1/object/public/social-media/workshop-imports/tenant-1/item-1/1764150000000_ab12cd34.jpg`,
      ],
      [
        "a resized storage picture",
        "https://api.aios.co.il/storage/v1/render/image/public/social-media/a.png?width=400",
      ],
      [
        "a file of the app itself",
        "https://app.aios.co.il/assets/carmen-abc123.png",
      ],
      ["a path on the app's own origin", "/assets/carmen-abc123.png"],
    ])("allows %s", (_what, address) => {
      expect(isAiosImageAddress(address, PRODUCTION)).toBe(true);
    });

    it("allows the configured supabase.co address when no custom domain is set", () => {
      expect(
        isAiosImageAddress(
          `${PROJECT_ORIGIN}/storage/v1/object/public/social-media/a.png`,
          DIRECT,
        ),
      ).toBe(true);
      expect(isAiosImageAddress("/logo.png", DIRECT)).toBe(true);
    });
  });

  describe("addresses outside AIOS", () => {
    it.each([
      ["any outside host", "https://collect.example/pixel.png?d=secret"],
      [
        "another Supabase project's storage",
        "https://zzzzzzzzzzzzzzzzzzzz.supabase.co/storage/v1/object/public/drop/p.png?d=secret",
      ],
      [
        "another AIOS environment's API",
        "https://api-staging.aios.co.il/storage/v1/object/public/social-media/a.png",
      ],
      [
        "a host that only starts with ours",
        "https://api.aios.co.il.collect.example/storage/v1/object/public/a.png",
      ],
      [
        "our host used as a user name",
        "https://api.aios.co.il@collect.example/storage/v1/object/public/a.png",
      ],
      [
        "a host that only starts with the app's",
        "https://app.aios.co.il.collect.example/a.png",
      ],
      [
        "the app's host used as a user name",
        "https://app.aios.co.il@collect.example/a.png",
      ],
      ["a protocol-relative address", "//collect.example/pixel.png"],
      ["backslashes for slashes", "https:\\\\collect.example\\pixel.png"],
      [
        "our storage host over plain http",
        "http://api.aios.co.il/storage/v1/object/public/social-media/a.png",
      ],
      [
        "our Supabase host outside storage",
        "https://api.aios.co.il/functions/v1/anything?d=secret",
      ],
      [
        "a storage path that is not where the address starts",
        "https://api.aios.co.il/functions/v1/x/storage/v1/a.png",
      ],
      [
        "a path that only starts like storage",
        "https://api.aios.co.il/storage/v1beta/a.png",
      ],
      ["an address that is not a URL", "https://"],
    ])("refuses %s", (_what, address) => {
      expect(isAiosImageAddress(address, PRODUCTION)).toBe(false);
    });

    it("refuses everything outside the app when no Supabase address is configured", () => {
      const bare: AiosAddressConfig = { appOrigin: "https://app.aios.co.il" };

      expect(
        isAiosImageAddress(
          "https://api.aios.co.il/storage/v1/object/public/a.png",
          bare,
        ),
      ).toBe(false);
    });

    it("refuses a relative address when the app's origin is unknown", () => {
      expect(isAiosImageAddress("/logo.png", {})).toBe(false);
    });

    it("counts only a web address as the environment's own", () => {
      const misconfigured: AiosAddressConfig = {
        ...PRODUCTION,
        supabaseUrl: "ftp://files.example",
      };

      expect(
        isAiosImageAddress(
          "ftp://files.example/storage/v1/object/public/a.png",
          misconfigured,
        ),
      ).toBe(false);
    });
  });
});

describe("projectOriginOf", () => {
  it("reads the project from a JWT key behind a custom domain", () => {
    expect(JWT_PUBLISHABLE_KEY).toMatch(/-.*_|_.*-/);
    expect(projectOriginOf(PRODUCTION)).toBe(PROJECT_ORIGIN);
  });

  it("is the configured address when the app talks to the project directly", () => {
    expect(projectOriginOf(DIRECT)).toBe(PROJECT_ORIGIN);
  });

  it.each([
    ["a key that is no JWT", OPAQUE_PUBLISHABLE_KEY],
    ["a JWT without a project", publishableKey({ role: "anon" })],
    ["a JWT whose project is not text", publishableKey({ ref: 12345 })],
    ["a JWT whose payload is not JSON", "eyJhbGciOiJIUzI1NiJ9.e30x.signature"],
    ["no key", undefined],
  ])("is unknown behind a custom domain with %s", (_what, key) => {
    expect(projectOriginOf({ ...PRODUCTION, publishableKey: key })).toBeNull();
  });

  it("does not take a custom domain for the project's address by its name", () => {
    const lookalike: AiosAddressConfig = {
      ...DIRECT,
      supabaseUrl: "https://notsupabase.co",
    };

    expect(projectOriginOf(lookalike)).toBeNull();
  });
});
