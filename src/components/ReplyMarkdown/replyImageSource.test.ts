import { describe, expect, it } from "vitest";
import { isAiosImageAddress, type AiosAddressConfig } from "./replyImageSource";

const PROJECT_REF = "abcdefghijklmnopqrst";

/** A Supabase publishable key in its JWT shape: the payload names the project. */
function publishableKey(claims: object): string {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}

/** Production's shape: the app talks to the custom domain (docs/ENVIRONMENTS.md). */
const PRODUCTION: AiosAddressConfig = {
  supabaseUrl: "https://api.aios.co.il",
  publishableKey: publishableKey({
    iss: "supabase",
    ref: PROJECT_REF,
    role: "anon",
  }),
  appOrigin: "https://app.aios.co.il",
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
        `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/social-media/workshop-imports/tenant-1/item-1/1764150000000_ab12cd34.jpg`,
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
      const staging: AiosAddressConfig = {
        supabaseUrl: `https://${PROJECT_REF}.supabase.co`,
        publishableKey: "sb_publishable_not-a-jwt",
        appOrigin: "http://localhost:8080",
      };

      expect(
        isAiosImageAddress(
          `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/social-media/a.png`,
          staging,
        ),
      ).toBe(true);
      expect(isAiosImageAddress("/logo.png", staging)).toBe(true);
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

    it("reads no project from a key whose ref is not a plain project id", () => {
      const forged: AiosAddressConfig = {
        ...PRODUCTION,
        publishableKey: publishableKey({ ref: "collect.example/x" }),
      };

      expect(
        isAiosImageAddress(
          "https://collect.example/storage/v1/object/public/a.png",
          forged,
        ),
      ).toBe(false);
    });
  });
});
