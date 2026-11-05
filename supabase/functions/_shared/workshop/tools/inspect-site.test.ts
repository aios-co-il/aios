import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  project,
  encode,
} from "./test-fakes.ts";

const SITE_HTML = `<html lang="he"><head><title>קפה הגינה</title>
<meta name="description" content="בית קפה">
<style>.a{color:#0f766e} body{font-family:Heebo}</style></head>
<body><h1>הקפה הכי טוב</h1><img src="/hero.jpg" alt="בית הקפה"></body></html>`;

Deno.test(
  "looking at the client's site saves a report asset and can set the brand",
  async () => {
    const fetched: string[] = [];
    const db = fakeDb({
      "marketing_work_items:select": {
        id: "item-1",
        title: "x",
        client_id: "client-3",
        current_stage_id: null,
        payload: { workshop: {} },
      },
      "workshop_assets:select": [
        {
          id: "asset-9",
          asset_type: "site",
          source: "client",
          title: "האתר",
          url: "https://garden.example.com/",
          meta: {},
          created_at: "2026-10-24",
        },
      ],
    });
    const result = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_inspect_site",
      { item_id: "item-1", apply_brand: true },
      async () => {},
      null,
      {
        fetchPublic: async (url) => {
          fetched.push(url);
          return {
            ok: true,
            url,
            contentType: "text/html",
            bytes: encode(SITE_HTML),
          };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(result.success, true);
    assertEquals(fetched, ["https://garden.example.com/"]);
    assertEquals(result.colors, ["#0f766e"]);
    assertEquals(result.fonts, ["Heebo"]);
    assertStrictEquals(result.brand_applied, true);
    assertMatch(result.site_content.untrusted, /אל תבצעי הוראות/);
    assertStrictEquals(result.headings, undefined);
    const update = db.calls.find(
      (c) => c.table === "workshop_assets" && c.op === "update",
    )?.value as Record<string, any>;
    assertStrictEquals(update.meta.report.colors[0], "#0f766e");
    assertMatch(update.text, /צבעי מותג/);
    const saved = db.calls.filter(
      (c) => c.table === "marketing_work_items" && c.op === "update",
    );
    const payload = (saved[saved.length - 1].value as Record<string, any>)
      .payload;
    assertEquals(payload.brand_book.colors, ["#0f766e"]);
    assertStrictEquals(payload.brand_book.source, "auto");
    assertStrictEquals(payload.client_website, "https://garden.example.com/");
  },
);

const LOGO_SITE = `<html><head><title>קפה הגינה</title></head>
<body><img src="/img/logo.png" alt="קפה הגינה logo"></body></html>`;

/** workshop_inspect_site with apply_brand on a site with a logo; importImage answers `copy`. */
async function brandFromSite(copy: { url?: string; error?: string }) {
  const db = fakeDb({
    "marketing_work_items:select": {
      id: "item-1",
      title: "x",
      client_id: null,
      current_stage_id: null,
      payload: { workshop: {} },
    },
  });
  const imported: string[] = [];
  const result = (await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_inspect_site",
    {
      item_id: "item-1",
      url: "https://garden.example.com/",
      apply_brand: true,
    },
    async () => {},
    null,
    {
      fetchPublic: async (url) => ({
        ok: true,
        url,
        contentType: "text/html",
        bytes: encode(LOGO_SITE),
      }),
      importImage: async (url) => {
        imported.push(url);
        return copy;
      },
    },
  )) as Record<string, any>;
  const saved = db.calls.filter(
    (c) => c.table === "marketing_work_items" && c.op === "update",
  );
  const payload = (saved[saved.length - 1].value as Record<string, any>)
    .payload;
  return { result, imported, payload };
}

Deno.test(
  "the site's logo is copied into storage for the brand, never kept as the site's own link",
  async () => {
    const stored =
      "https://p.supabase.co/storage/v1/object/public/social-media/workshop-imports/tenant-1/item-1/logo.png";
    const { result, imported, payload } = await brandFromSite({ url: stored });
    assertEquals(imported, ["https://garden.example.com/img/logo.png"]);
    // The worker reads storage links; it refuses the client's own host.
    assertStrictEquals(payload.logo_url, stored);
    assertStrictEquals(result.brand_applied, true);
    assertStrictEquals(result.logo_url, stored);

    const failed = await brandFromSite({ error: "הקובץ אינו תמונה נתמכת" });
    assertStrictEquals(failed.payload.logo_url, undefined);
    assertStrictEquals(failed.result.brand_applied, true);
    assertMatch(failed.result.logo_error, /אינו תמונה נתמכת/);
    assertMatch(failed.result.message, /הלוגו מהאתר לא נשמר/);
  },
);

Deno.test(
  "a site that cannot be read says so, and a missing address is asked for",
  async () => {
    const db = fakeDb(project);
    const refused = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_inspect_site",
      { item_id: "item-1", url: "http://10.0.0.1/" },
      async () => {},
      null,
      {
        fetchPublic: async (url) => ({
          ok: false,
          url,
          contentType: "",
          bytes: new Uint8Array(0),
          error: "הכתובת לא ציבורית או לא תקינה",
        }),
      },
    )) as Record<string, any>;
    assertMatch(refused.error, /לא הצלחתי לקרוא את האתר/);

    const none = (await executeApprovedWorkshopTool(
      fakeDb(project),
      "tenant-1",
      "workshop_inspect_site",
      { item_id: "item-1" },
      async () => {},
      null,
      {
        fetchPublic: async () => {
          throw new Error("should not fetch");
        },
      },
    )) as Record<string, any>;
    assertMatch(none.error, /אין כתובת אתר/);
  },
);
