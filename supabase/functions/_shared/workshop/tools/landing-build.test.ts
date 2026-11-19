import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { contentDigest, contentJson } from "../landing/page-files.ts";
import { PUBLISH_CHOICE } from "../landing/project.ts";
import type { LandingRepo } from "../landing/repo.ts";
import { executeApprovedWorkshopTool, fakeDb } from "./test-fakes.ts";

/** A tool result or a stored row, read loosely in assertions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form JSON a test reads into
type Loose = Record<string, any>;

const form = { buttonLabel: "לתיאום שיחה", successMessage: "תודה" };
const blocks = [
  { type: "hero" as const, heading: "כותרת", form },
  { type: "leadForm" as const, heading: "השאירו פרטים", form },
];
const style = {
  primaryColor: "#112233",
  hero: "dark" as const,
  direction: "נקי",
};
const approved = { blocks, copy_approved: true, style, style_approved: true };
const digest = await contentDigest(contentJson(blocks, style));
const built = {
  branch: "page/acme/offer",
  commit: "commit-1",
  digest,
  preview_url: "https://preview.example/offer?site=acme",
};
const OUR_SITE = '{"tenantId":"tenant-1","clientId":"client-1"}';

/** A fake database: a landing project in the given state, with its page settings. */
function landingDb(state: Record<string, unknown>, page: Loose | null = {}) {
  return fakeDb({
    "marketing_work_items:select": {
      id: "item-1",
      title: "מבצע",
      client_id: null,
      payload: { project_type: "landing", landing: state },
    },
    "landing_pages:select": page && {
      slug: "offer",
      title: "מבצע",
      site_id: "site-1",
      lead_to_crm: true,
      lead_to_webhook: false,
      ...page,
    },
    "landing_sites:select": { subdomain: "acme", client_id: "client-1" },
    "clients:select": { name: "Acme" },
  });
}

/** A fake repository that records what Carmen pushes and opens. */
function fakeRepo(files: Record<string, string> = {}, preview = true) {
  const pushes: Array<{ branch: string; files: Record<string, string> }> = [];
  const pulls: Array<string> = [];
  const repo: LandingRepo = {
    readFile: (path) => Promise.resolve(files[path] ?? null),
    pushFiles: (branch, pushed) => {
      pushes.push({ branch, files: pushed });
      return Promise.resolve("commit-1");
    },
    previewUrl: () =>
      Promise.resolve(preview ? "https://preview.example" : null),
    openPull: (branch) => {
      pulls.push(branch);
      return Promise.resolve("https://github.example/pull/1");
    },
  };
  return { repo, pushes, pulls };
}

/** Runs one landing tool on item-1 with the given repository. */
async function run(
  db: ReturnType<typeof fakeDb>,
  name: string,
  repo?: LandingRepo,
): Promise<Loose> {
  return (await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    name,
    { item_id: "item-1" },
    undefined,
    null,
    { landingRepo: repo, sleep: () => Promise.resolve() },
  )) as Loose;
}

/** The landing state the tool saved last. */
function savedLanding(db: ReturnType<typeof fakeDb>): Loose {
  const update = db.calls.findLast((call) => call.op === "update");
  return (update?.value as Loose).payload.landing;
}

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
      JSON.parse(pushes[0].files["landing-pages/acme/offer/page.json"]).status,
      "published",
    );
    assertEquals(pulls, ["page/acme/offer"]);
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
