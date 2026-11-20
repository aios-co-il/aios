import { describe, expect, test } from "vitest";
import {
  draftProblem,
  landingPageUrl,
  NO_TRACKING,
  trackingProblem,
  type LandingSettings,
  type LandingSettingsDraft,
} from "./landingSettings";

const saved: LandingSettings = {
  subdomain: "acme",
  slug: "home",
  leadToCrm: false,
  leadToWebhook: false,
  siteExists: true,
  pageExists: true,
  tracking: NO_TRACKING,
};

const draft: LandingSettingsDraft = {
  subdomain: "acme",
  slug: "home",
  leadToCrm: true,
  leadToWebhook: false,
  webhookUrl: "",
};

describe("landingPageUrl", () => {
  test("the home page is served on the site's root", () => {
    expect(landingPageUrl("acme", "home")).toBe("https://acme.aios.co.il");
  });

  test("any other page is served under its slug", () => {
    expect(landingPageUrl("acme", "cyber")).toBe(
      "https://acme.aios.co.il/cyber",
    );
  });
});

describe("draftProblem", () => {
  test("a valid draft has no problem", () => {
    expect(draftProblem(draft, saved)).toBeNull();
  });

  test("a bad subdomain or page address is named", () => {
    expect(draftProblem({ ...draft, subdomain: "Acme.co" }, saved)).toContain(
      "תת־דומיין",
    );
    expect(draftProblem({ ...draft, slug: "my page" }, saved)).toContain(
      "כתובת העמוד",
    );
  });

  test("a webhook destination needs a URL unless one is stored", () => {
    const toWebhook = { ...draft, leadToWebhook: true };
    expect(draftProblem(toWebhook, saved)).toBe("צריך להזין כתובת וובהוק");
    expect(
      draftProblem(toWebhook, { ...saved, leadToWebhook: true }),
    ).toBeNull();
    expect(
      draftProblem(
        { ...toWebhook, webhookUrl: "https://hooks.example/a" },
        saved,
      ),
    ).toBeNull();
  });

  test("a webhook URL must be https", () => {
    expect(
      draftProblem(
        { ...draft, leadToWebhook: true, webhookUrl: "http://x.example" },
        saved,
      ),
    ).toContain("https://");
  });
});

describe("trackingProblem", () => {
  test("no ids and valid ids have no problem", () => {
    expect(trackingProblem(NO_TRACKING)).toBeNull();
    expect(
      trackingProblem({
        gtmId: "GTM-NVKZTXH3",
        ga4Id: " G-ABC1234 ",
        metaPixelId: "1234567890",
      }),
    ).toBeNull();
  });

  test("an id in the wrong format is named with an example", () => {
    expect(trackingProblem({ ...NO_TRACKING, gtmId: "GTM-1" })).toContain(
      "Google Tag Manager",
    );
    expect(trackingProblem({ ...NO_TRACKING, ga4Id: "UA-12345" })).toContain(
      "G-ABC123XYZ",
    );
    expect(trackingProblem({ ...NO_TRACKING, metaPixelId: "pixel" })).toContain(
      "Meta Pixel",
    );
  });
});
