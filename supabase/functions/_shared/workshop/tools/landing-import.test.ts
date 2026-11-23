import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  approved,
  fakeRepo,
  landingDb,
  run,
  savedLanding,
} from "./landing-build-kit.ts";

const form = { buttonLabel: "לתיאום", successMessage: "תודה" };
const LIVE = JSON.stringify({
  theme: { primaryColor: "#112233", dir: "rtl", lang: "he", hero: "dark" },
  blocks: [
    { type: "hero", heading: "כותרת", form },
    { type: "leadForm", heading: "השאירו פרטים", form },
  ],
});

Deno.test(
  "a live page becomes the project's approved copy and style",
  async () => {
    const db = landingDb({});
    const { repo } = fakeRepo({
      "landing-pages/acme/offer/content.json": LIVE,
    });
    const result = await run(db, "workshop_import_landing_page", repo);
    assertEquals(result.sections, 2);
    const saved = savedLanding(db);
    assertEquals([saved.copy_approved, saved.style_approved], [true, true]);
    assertEquals(saved.style.primaryColor, "#112233");
    assertEquals(
      db.calls.filter(
        (call) => call.table === "workshop_artifacts" && call.op === "insert",
      ).length,
      2,
    );
  },
);

Deno.test("import never overwrites copy the project already has", async () => {
  const db = landingDb(approved);
  const { repo } = fakeRepo({ "landing-pages/acme/offer/content.json": LIVE });
  const result = await run(db, "workshop_import_landing_page", repo);
  assertStringIncludes(result.error, "כבר יש קופי");
  assertEquals(
    db.calls.some((call) => call.op === "update"),
    false,
  );
});

Deno.test("a page that is not live yet is a new page", async () => {
  const db = landingDb({});
  const { repo } = fakeRepo();
  const result = await run(db, "workshop_import_landing_page", repo);
  assertStringIncludes(result.error, "אין עמוד קיים");
});

Deno.test(
  "a board write that fails empties the project again, so a retry can import",
  async () => {
    const db = landingDb({});
    const { repo } = fakeRepo({
      "landing-pages/acme/offer/content.json": LIVE,
    });
    const from = db.from.bind(db);
    db.from = (table: string) => {
      const builder = from(table);
      if (table === "workshop_artifacts") {
        builder.insert = () => {
          throw new Error("board is down");
        };
      }
      return builder;
    };
    const result = await run(db, "workshop_import_landing_page", repo);
    assertStringIncludes(result.error, "board is down");
    assertEquals(savedLanding(db).blocks, undefined);
  },
);

Deno.test(
  "a caller without access to the page's client imports nothing",
  async () => {
    const db = landingDb({});
    const { repo } = fakeRepo({
      "landing-pages/acme/offer/content.json": LIVE,
    });
    const result = await run(
      db,
      "workshop_import_landing_page",
      repo,
      {},
      (clientId) =>
        clientId === "client-1"
          ? Promise.reject(new Error("no"))
          : Promise.resolve(),
    );
    assertEquals(result.error, "אין הרשאה ללקוח הזה");
    assertEquals(
      db.calls.some((call) => call.op === "update"),
      false,
    );
  },
);
