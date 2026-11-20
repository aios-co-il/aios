import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  approved,
  blocks,
  built,
  digest,
  fakeRepo,
  landingDb,
  pushedJson,
  type Loose,
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
      pushedJson(pushes[0].files, "landing-pages/acme/offer/page.json").status,
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

Deno.test(
  "a build does not put itself back over a copy saved while it was pushing",
  async () => {
    const db = landingDb(approved);
    const { repo } = fakeRepo({ "landing-pages/acme/site.json": OUR_SITE });
    const push = repo.pushFiles;
    repo.pushFiles = (...call) => {
      // The user's new copy lands while the build is on its way to GitHub.
      const item = db.script["marketing_work_items:select"] as {
        payload: { landing: Record<string, unknown> };
      };
      item.payload.landing = { ...approved, copy_approved: false };
      return push(...call);
    };
    const result = await run(db, "workshop_build_landing_page", repo);
    assertStringIncludes(result.error, "השתנה בזמן הבנייה");
    assertEquals(
      db.calls.some((call) => call.op === "update"),
      false,
    );
  },
);

Deno.test(
  "a picture from the project's assets is copied into the page and shown in the hero",
  async () => {
    const id = "11111111-2222-4333-8444-555555555555";
    const db = landingDb({
      ...approved,
      blocks: [{ ...blocks[0], imageUrl: `asset:${id}` }, blocks[1]],
    });
    db.script["workshop_assets:select"] = {
      asset_type: "image",
      storage_path: "tenant-1/workshop/item-1/1_photo.png",
    };
    (db as Loose).storage = {
      from: () => ({
        download: () =>
          Promise.resolve({
            data: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7])]),
            error: null,
          }),
      }),
    };
    const { repo, pushes } = fakeRepo({
      "landing-pages/acme/site.json": OUR_SITE,
    });
    await run(db, "workshop_build_landing_page", repo);
    const files = pushes[0].files;
    const hero = pushedJson(files, "landing-pages/acme/offer/content.json")
      .blocks[0];
    assertEquals(
      hero.imageUrl,
      "assets/asset-11111111222243338444555555555555.png",
    );
    assertEquals(
      files[
        "landing-pages/acme/offer/assets/asset-11111111222243338444555555555555.png"
      ],
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 7]),
    );
  },
);

Deno.test(
  "a changed file behind the same asset changes the build, so publish never ships unseen media",
  async () => {
    const digests = [];
    for (const byte of [7, 8]) {
      const db = assetBuildDb(byte);
      const { repo } = fakeRepo({ "landing-pages/acme/site.json": OUR_SITE });
      await run(db, "workshop_build_landing_page", repo);
      digests.push(savedLanding(db).build.digest);
    }
    assertEquals(digests[0] === digests[1], false);
  },
);

/** A project whose hero shows an uploaded picture with the given single byte. */
function assetBuildDb(byte: number) {
  const id = "11111111-2222-4333-8444-555555555555";
  const db = landingDb({
    ...approved,
    blocks: [{ ...blocks[0], imageUrl: `asset:${id}` }, blocks[1]],
  });
  db.script["workshop_assets:select"] = {
    asset_type: "image",
    storage_path: "tenant-1/workshop/item-1/1_photo.png",
  };
  (db as Loose).storage = {
    from: () => ({
      download: () =>
        Promise.resolve({
          data: new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, byte])]),
          error: null,
        }),
    }),
  };
  return db;
}

Deno.test(
  "new tracking ids in AIOS rebuild with site.json, keeping its other keys",
  async () => {
    const db = landingDb(
      { ...approved, build: built },
      {},
      { ga4_id: "G-ABC1234" },
    );
    const site = {
      tenantId: "tenant-1",
      clientId: "client-1",
      leads: { destination: "webhook" },
      tracking: { gtmId: "GTM-NVKZTXH3" },
    };
    const { repo, pushes } = fakeRepo({
      "landing-pages/acme/site.json": JSON.stringify(site),
    });
    await run(db, "workshop_build_landing_page", repo);
    assertEquals(pushes.length, 1);
    assertEquals(pushedJson(pushes[0].files, "landing-pages/acme/site.json"), {
      ...site,
      tracking: { ga4Id: "G-ABC1234" },
    });
    // The site.json is part of what the user approves, so the build is a new one.
    assertEquals(savedLanding(db).build.digest === digest, false);
  },
);

Deno.test(
  "tracking the repository already holds leaves site.json out of the build",
  async () => {
    const db = landingDb(approved, {}, { gtm_id: "GTM-NVKZTXH3" });
    const { repo, pushes } = fakeRepo({
      "landing-pages/acme/site.json":
        '{"tracking":{"gtmId":"GTM-NVKZTXH3"},"clientId":"client-1","tenantId":"tenant-1"}',
    });
    await run(db, "workshop_build_landing_page", repo);
    assertEquals("landing-pages/acme/site.json" in pushes[0].files, false);
    // The tags a publish makes live are part of what the user approves, written or not.
    assertEquals(savedLanding(db).build.digest === digest, false);
  },
);
