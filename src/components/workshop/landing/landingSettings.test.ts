import { describe, expect, test } from "vitest";
import {
  draftProblem,
  landingPageUrl,
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
