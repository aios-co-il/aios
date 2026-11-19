import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  approved,
  blocks,
  built,
  digest,
  fakeRepo,
  landingDb,
  OUR_SITE,
  run,
  savedLanding,
} from "./landing-build-kit.ts";
import { buildTag, PUBLISH_CHOICE } from "../landing/project.ts";

Deno.test(
  "build pushes a draft to the page's branch and asks before publishing",
  async () => {
    const db = landingDb(approved);
    const { repo, pushes } = fakeRepo({
      "landing-pages/acme/site.json": OUR_SITE,
    });
    const result = await run(db, "workshop_build_landing_page", repo);
    assertEquals(pushes.length, 1);
    assertEquals(pushes[0].branch, "page/acme/offer");
    assertEquals(
      JSON.parse(pushes[0].files["landing-pages/acme/offer/page.json"]).status,
      "draft",
    );
    assertStringIncludes(
      result.say_to_user,
      "https://preview.example/offer?site=acme",
    );
    assertStringIncludes(result.say_to_user, PUBLISH_CHOICE);
    // The message names the build, which is what ties the user's tap to this preview.
    assertStringIncludes(result.say_to_user, buildTag(digest));
    assertEquals(savedLanding(db).build, built);
  },
);

Deno.test("building the same content again pushes nothing", async () => {
  const db = landingDb({ ...approved, build: built });
  const { repo, pushes } = fakeRepo({
    "landing-pages/acme/site.json": OUR_SITE,
  });
  const result = await run(db, "workshop_build_landing_page", repo);
  assertEquals(pushes, []);
  assertEquals(result.preview_ready, true);
});

Deno.test("a new copy drops the build and its publish approval", async () => {
  const db = landingDb({ ...approved, build: built, publish_approved: digest });
  await run(db, "workshop_save_landing_copy", undefined, { blocks });
  const saved = savedLanding(db);
  assertEquals(saved.copy_approved, false);
  assertEquals([saved.build, saved.publish_approved], [undefined, undefined]);
});

Deno.test(
  "the pushed commit is saved even when the preview check fails",
  async () => {
    const db = landingDb(approved);
    const { repo } = fakeRepo({ "landing-pages/acme/site.json": OUR_SITE });
    repo.previewUrl = () => Promise.reject(new Error("GitHub is down"));
    const result = await run(db, "workshop_build_landing_page", repo);
    assertStringIncludes(result.error, "GitHub is down");
    assertEquals(savedLanding(db).build.commit, "commit-1");
  },
);

Deno.test(
  "a preview that is still building is reported without the publish question",
  async () => {
    const db = landingDb(approved);
    const { repo } = fakeRepo(
      { "landing-pages/acme/site.json": OUR_SITE },
      false,
    );
    const result = await run(db, "workshop_build_landing_page", repo);
    assertEquals(result.preview_ready, false);
    assertEquals(result.say_to_user.includes(PUBLISH_CHOICE), false);
  },
);

Deno.test(
  "build refuses before both approvals, without an address, and without the repository",
  async () => {
    const { repo, pushes } = fakeRepo();
    const early = await run(
      landingDb({ ...approved, style_approved: false }),
      "workshop_build_landing_page",
      repo,
    );
    assertStringIncludes(early.error, "אישר");
    const homeless = await run(
      landingDb(approved, null),
      "workshop_build_landing_page",
      repo,
    );
    assertStringIncludes(homeless.error, "כתובת");
    const offline = await run(
      landingDb(approved),
      "workshop_build_landing_page",
    );
    assertStringIncludes(offline.error, "LANDING_PAGES_GITHUB_TOKEN");
    assertEquals(pushes, []);
  },
);

Deno.test(
  "build refuses a subdomain whose site belongs to another org",
  async () => {
    const db = landingDb(approved);
    const { repo, pushes } = fakeRepo({
      "landing-pages/acme/site.json":
        '{"tenantId":"other","clientId":"client-1"}',
    });
    const result = await run(db, "workshop_build_landing_page", repo);
    assertStringIncludes(result.error, "שייכת לאתר אחר");
    assertEquals(pushes, []);
  },
);
