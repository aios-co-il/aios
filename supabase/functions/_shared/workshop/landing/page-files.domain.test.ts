import { assertEquals } from "jsr:@std/assert@1";
import {
  buildDigest,
  contentJson,
  landingPageFiles,
  siteFingerprint,
} from "./page-files.ts";

const form = { buttonLabel: "לתיאום שיחה", successMessage: "תודה" };
const blocks = [{ type: "leadForm" as const, heading: "השאירו פרטים", form }];
const style = {
  primaryColor: "#112233",
  hero: "dark" as const,
  direction: "נקי",
};
const input = {
  site: {
    subdomain: "acme",
    tenantId: "t-1",
    clientId: "c-1",
    name: "Acme",
    tracking: {},
    customDomain: null,
    customDomainVerified: false,
  },
  slug: "home",
  title: "עמוד הבית",
  itemId: "item-1",
  blocks,
  style,
  status: "draft" as const,
  existingPage: null,
  today: "2026-11-20",
  existingSite: { name: "Acme", tenantId: "t-1", clientId: "c-1" },
};

Deno.test(
  "a custom domain rewrites only the domains of an existing site.json",
  () => {
    const existingSite = {
      name: "Acme",
      tenantId: "t-1",
      clientId: "c-1",
      leads: { destination: "aios" },
      tracking: { gtmId: "GTM-ABCD12" },
    };
    const files = landingPageFiles({
      ...input,
      site: {
        ...input.site,
        tracking: { gtmId: "GTM-ABCD12" },
        customDomain: "lp.acme.co.il",
      },
      existingSite,
    });
    const written = files["landing-pages/acme/site.json"];
    assertEquals(JSON.parse(written), {
      ...existingSite,
      domains: ["lp.acme.co.il"],
    });
    // Every other key stays in its place; the domains come last.
    assertEquals(Object.keys(JSON.parse(written)), [
      ...Object.keys(existingSite),
      "domains",
    ]);
  },
);

Deno.test(
  "a removed domain drops the key, and an unchanged one writes nothing",
  () => {
    const existingSite = {
      name: "Acme",
      tenantId: "t-1",
      clientId: "c-1",
      domains: ["lp.acme.co.il"],
    };
    const removed = landingPageFiles({ ...input, existingSite });
    assertEquals(JSON.parse(removed["landing-pages/acme/site.json"]), {
      name: "Acme",
      tenantId: "t-1",
      clientId: "c-1",
    });
    const kept = landingPageFiles({
      ...input,
      site: { ...input.site, customDomain: "lp.acme.co.il" },
      existingSite,
    });
    assertEquals("landing-pages/acme/site.json" in kept, false);
  },
);

Deno.test("new tracking ids and a new domain are written together", () => {
  const files = landingPageFiles({
    ...input,
    site: {
      ...input.site,
      tracking: { ga4Id: "G-ABC1234" },
      customDomain: "lp.acme.co.il",
    },
    existingSite: null,
  });
  const site = JSON.parse(files["landing-pages/acme/site.json"]);
  assertEquals(site.tracking, { ga4Id: "G-ABC1234" });
  assertEquals(site.domains, ["lp.acme.co.il"]);
});

Deno.test("the build fingerprint covers the site's domain", async () => {
  const target = { subdomain: "acme", slug: "home", title: "עמוד הבית" };
  const content = contentJson(blocks, style);
  const tracking = { gtmId: "GTM-ABCD12" };
  const before = await buildDigest(target, content, {
    tracking,
    customDomain: null,
  });
  const withDomain = await buildDigest(target, content, {
    tracking,
    customDomain: "lp.acme.co.il",
  });
  assertEquals(before === withDomain, false);
  assertEquals(
    await buildDigest(target, content, {
      tracking,
      customDomain: "LP.acme.co.il",
    }),
    withDomain,
  );
  // A site with tracking ids only keeps the digest it had before domains existed.
  assertEquals(
    siteFingerprint({ tracking, customDomain: null }),
    '{"gtmId":"GTM-ABCD12"}',
  );
});
