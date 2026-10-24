import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assetForCarmen,
  assetTypeFor,
  clientAssetRows,
  syncClientAssets,
  type AssetView,
} from "./assets.ts";

const scope = { tenantId: "t1", itemId: "i1" };
const publicUrl = (path: string) => `https://files.test/${path}`;

test("a client's brief, site, links and files become assets marked as the client's", () => {
  const rows = clientAssetRows(
    {
      id: "c1",
      name: "קפה הגינה",
      industry: "מסעדנות",
      website: "garden.example.com",
      notes: "קהל צעיר, טון חם",
      services: ["קייטרינג", { name: "משלוחים" }],
      folder_links: [
        { name: "בריף בדרייב", url: "https://drive.google.com/x" },
        { name: "רע", url: "javascript:1" },
      ],
      attachments: [
        {
          name: "logo.png",
          path: "t1/client/c1/1_logo.png",
          type: "image/png",
        },
        {
          name: "menu.pdf",
          path: "t1/client/c1/2_menu.pdf",
          type: "application/pdf",
        },
      ],
    },
    scope,
    publicUrl,
  );
  assert.deepEqual(
    rows.map((r) => [r.asset_type, r.title]),
    [
      ["text", "בריף הלקוח"],
      ["site", "האתר של הלקוח · garden.example.com"],
      ["link", "בריף בדרייב"],
      ["image", "logo.png"],
      ["file", "menu.pdf"],
    ],
  );
  assert.ok(rows.every((r) => r.source === "client" && r.tenant_id === "t1"));
  assert.match(rows[0].text ?? "", /תחום: מסעדנות/);
  assert.match(rows[0].text ?? "", /שירותים: קייטרינג, משלוחים/);
  assert.equal(rows[1].url, "https://garden.example.com");
  assert.equal(rows[3].url, "https://files.test/t1/client/c1/1_logo.png");
});

test("a client with only a name brings no brief", () => {
  assert.deepEqual(
    clientAssetRows({ id: "c1", name: "ריק" }, scope, publicUrl),
    [],
  );
});

test("file and link types are told apart", () => {
  assert.equal(assetTypeFor({ name: "a.JPG" }), "image");
  assert.equal(assetTypeFor({ name: "a.mov" }), "video");
  assert.equal(
    assetTypeFor({ name: "a.pdf", mime: "application/pdf" }),
    "file",
  );
  assert.equal(assetTypeFor({ url: "https://x.co/page" }), "link");
  assert.equal(assetTypeFor({ url: "https://x.co/p.png?v=1" }), "image");
});

function fakeDb(client: unknown) {
  const calls: { table: string; op: string; value?: unknown }[] = [];
  return {
    calls,
    from(table: string) {
      let op = "select";
      const builder: Record<string, unknown> = {
        delete() {
          op = "delete";
          calls.push({ table, op });
          return builder;
        },
        insert(value: unknown) {
          op = "insert";
          calls.push({ table, op, value });
          return builder;
        },
        select: () => builder,
        eq: () => builder,
        maybeSingle: () => Promise.resolve({ data: client, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          resolve({ data: null, error: null }),
      };
      return builder;
    },
  };
}

test("assigning a client replaces the old client assets; no client only removes them", async () => {
  const db = fakeDb({ id: "c1", name: "א", website: "https://a.co" });
  const synced = await syncClientAssets(
    db,
    { ...scope, clientId: "c1" },
    publicUrl,
  );
  assert.equal(synced.added, 1);
  assert.deepEqual(
    db.calls.map((c) => c.op),
    ["delete", "insert"],
  );

  const cleared = fakeDb(null);
  assert.equal(
    (await syncClientAssets(cleared, { ...scope, clientId: null }, publicUrl))
      .added,
    0,
  );
  assert.deepEqual(
    cleared.calls.map((c) => c.op),
    ["delete"],
  );
});

test("Carmen reads assets without storage paths and with trimmed text", () => {
  const asset: AssetView = {
    id: "a1",
    asset_type: "site",
    source: "client",
    title: "האתר",
    url: "https://a.co",
    storage_path: "secret/path",
    text: "x".repeat(3000),
    use_as_reference: false,
    meta: { inspected_at: "2026-10-24", report: { colors: ["#0f766e"] } },
    created_at: "2026-10-24",
  };
  const view = assetForCarmen(asset) as Record<string, unknown>;
  assert.equal("storage_path" in view, false);
  assert.equal((view.text as string).length, 1500);
  assert.equal(view.inspected, true);
  assert.deepEqual(view.site_colors, ["#0f766e"]);
});
