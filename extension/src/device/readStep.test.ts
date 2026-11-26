import { describe, expect, it } from "vitest";
import { decideReadStep } from "./readStep.ts";

const ORIGINS = {
  appOrigins: ["https://aios.co.il"],
  backendOrigins: ["https://api.aios.co.il", "https://project.supabase.co"],
};

describe("decideReadStep", () => {
  it("reads an https page, reporting its origin and path and never its query or fragment", () => {
    expect(
      decideReadStep("https://shop.example/items/1?token=secret#top", ORIGINS),
    ).toEqual({
      kind: "read",
      location: { origin: "https://shop.example", path: "/items/1" },
      host: "shop.example",
      pattern: "https://shop.example/*",
      rule: "free",
    });
  });

  it("asks Chrome for the host without its port, and names the host with it", () => {
    const step = decideReadStep("https://shop.example:8443/", ORIGINS);

    expect(step).toMatchObject({
      host: "shop.example:8443",
      pattern: "https://shop.example/*",
    });
  });

  it("names an internationalised host in punycode, as Chrome's prompt does", () => {
    expect(decideReadStep("https://חנות.example/", ORIGINS)).toMatchObject({
      host: "xn--9dbd1a4b.example",
      pattern: "https://xn--9dbd1a4b.example/*",
    });
  });

  it("refuses without an address from Chrome", () => {
    expect(decideReadStep(undefined, ORIGINS)).toEqual({
      kind: "refuse",
      reason: "address_unknown",
    });
  });

  it("refuses every never-controllable page", () => {
    const pages = [
      "https://aios.co.il/t/acme/command-center",
      "https://api.aios.co.il/functions/v1/x",
      "https://project.supabase.co/",
      "https://accounts.google.com/signin",
      "https://chromewebstore.google.com/detail/x",
      "https://vercel.com/dashboard",
      "https://aios.co.il@evil.example/",
      "chrome://extensions/",
      "file:///etc/passwd",
    ];

    for (const page of pages) {
      expect(decideReadStep(page, ORIGINS)).toEqual({
        kind: "refuse",
        reason: "never_controllable",
      });
    }
  });

  it("refuses when the contract throws on the configured origins", () => {
    const misconfigured = { appOrigins: ["aios.co.il"], backendOrigins: [] };

    expect(decideReadStep("https://shop.example/", misconfigured)).toEqual({
      kind: "refuse",
      reason: "configuration",
    });
  });

  it("refuses an http page, which is never granted", () => {
    expect(decideReadStep("http://shop.example/", ORIGINS)).toEqual({
      kind: "refuse",
      reason: "not_https",
    });
  });

  it("refuses a path the server would refuse instead of rewriting it", () => {
    for (const page of [
      "https://shop.example//evil.example/x",
      `https://shop.example/${"a".repeat(2048)}`,
    ]) {
      expect(decideReadStep(page, ORIGINS)).toEqual({
        kind: "refuse",
        reason: "path_not_reportable",
      });
    }
  });
});
