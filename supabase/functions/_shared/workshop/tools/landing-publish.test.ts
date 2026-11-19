import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  approved,
  blocks,
  built,
  digest,
  fakeRepo,
  landingDb,
  pushedJson,
  OUR_SITE,
  run,
  savedLanding,
} from "./landing-build-kit.ts";

Deno.test(
  "a build previewed at one address is not reused after the address changes",
  async () => {
    // Same copy and style, built and approved for /offer; the settings now say /sale.
    const db = landingDb(
      { ...approved, build: built, publish_approved: digest },
      { slug: "sale" },
    );
    const { repo, pushes, pulls } = fakeRepo({
      "landing-pages/acme/site.json": OUR_SITE,
    });
    const refused = await run(db, "workshop_publish_landing_page", repo);
    assertStringIncludes(refused.error, "השתנו מאז התצוגה");
    assertEquals([pushes, pulls], [[], []]);
    await run(db, "workshop_build_landing_page", repo);
    assertEquals(pushes[0].branch, "page/acme/sale");
  },
);

Deno.test("publish refuses a build the user has not approved", async () => {
  const db = landingDb({ ...approved, build: built });
  const { repo, pushes, pulls } = fakeRepo({
    "landing-pages/acme/site.json": OUR_SITE,
  });
  const result = await run(db, "workshop_publish_landing_page", repo);
  assertStringIncludes(result.error, "עוד לא אישר");
  assertEquals([pushes, pulls], [[], []]);
});

Deno.test(
  "publish refuses when the copy changed after the approved preview",
  async () => {
    const changed = [{ ...blocks[0], heading: "כותרת אחרת" }, blocks[1]];
    const db = landingDb({
      ...approved,
      blocks: changed,
      build: built,
      publish_approved: digest,
    });
    const { repo, pushes } = fakeRepo({
      "landing-pages/acme/site.json": OUR_SITE,
    });
    const result = await run(db, "workshop_publish_landing_page", repo);
    assertStringIncludes(result.error, "השתנו מאז התצוגה");
    assertEquals(pushes, []);
  },
);

Deno.test("publish refuses a page whose leads have nowhere to go", async () => {
  const db = landingDb(
    { ...approved, build: built, publish_approved: digest },
    { lead_to_crm: false },
  );
  const { repo, pushes } = fakeRepo({
    "landing-pages/acme/site.json": OUR_SITE,
  });
  const result = await run(db, "workshop_publish_landing_page", repo);
  assertStringIncludes(result.error, "יעד ללידים");
  assertEquals(pushes, []);
});

Deno.test(
  "publish marks the approved build published and opens its pull request",
  async () => {
    const db = landingDb({
      ...approved,
      build: built,
      publish_approved: digest,
    });
    const { repo, pushes, pulls } = fakeRepo({
      "landing-pages/acme/site.json": OUR_SITE,
    });
    const result = await run(db, "workshop_publish_landing_page", repo);
    assertEquals(
      pushedJson(pushes[0].files, "landing-pages/acme/offer/page.json").status,
      "published",
    );
    // The publishing branch is named after the build, so a later draft cannot change it.
    assertEquals(pulls, [`publish/acme/offer-${digest.slice(0, 12)}`]);
    assertEquals(pushes[0].branch, pulls[0]);
    assertEquals(result.live_url, "https://acme.aios.co.il/offer");
    assertEquals(savedLanding(db).published, {
      digest,
      pull_url: "https://github.example/pull/1",
      live_url: "https://acme.aios.co.il/offer",
    });
  },
);

Deno.test("a client's first page says a person merges it", async () => {
  const db = landingDb({ ...approved, build: built, publish_approved: digest });
  const { repo, pushes } = fakeRepo();
  const result = await run(db, "workshop_publish_landing_page", repo);
  assertEquals("landing-pages/acme/site.json" in pushes[0].files, true);
  assertStringIncludes(result.say_to_user, "אישור ידני");
});
