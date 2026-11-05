import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { executeApprovedWorkshopTool, fakeDb, project } from "./test-fakes.ts";

Deno.test(
  "a project can be assigned to a client later, or released back to no client",
  async () => {
    const project = {
      "marketing_work_items:select": {
        id: "item-1",
        title: "פרויקט",
        client_id: null,
        current_stage_id: null,
        payload: { workshop: {} },
      },
    };
    const db = fakeDb(project);
    const done = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_assign_client",
      { item_id: "item-1", client_id: "client-3" },
    )) as Record<string, any>;
    assertStrictEquals(done.success, true);
    const call = db.calls.find((c) => c.table === "rpc:workshop_assign_client");
    assertEquals(call?.value, {
      p_item_id: "item-1",
      p_client_id: "client-3",
    });

    const released = fakeDb(project);
    await executeApprovedWorkshopTool(
      released,
      "tenant-1",
      "workshop_assign_client",
      {
        item_id: "item-1",
      },
    );
    const releaseCall = released.calls.find(
      (c) => c.table === "rpc:workshop_assign_client",
    );
    assertStrictEquals(
      (releaseCall?.value as Record<string, unknown>).p_client_id,
      null,
    );

    const refused = fakeDb(project);
    const denied = (await executeApprovedWorkshopTool(
      refused,
      "tenant-1",
      "workshop_assign_client",
      { item_id: "item-1", client_id: "client-9" },
      async () => {
        throw new Error("אין הרשאה ללקוח הזה");
      },
    )) as Record<string, unknown>;
    assertStrictEquals(denied.error, "אין הרשאה ללקוח הזה");
    assertStrictEquals(
      refused.calls.some((c) => c.table === "rpc:workshop_assign_client"),
      false,
    );
  },
);

Deno.test(
  "assigning a project of another department passes the RPC's refusal through",
  async () => {
    const seo = {
      "marketing_work_items:select": {
        id: "item-2",
        title: "SEO",
        client_id: "client-1",
        current_stage_id: "stage-1",
        payload: { department: "seo" },
      },
    };
    const locked =
      "פרויקט SEO / GEO נשאר אצל הלקוח שלו: אי אפשר להעביר אותו ללקוח אחר או להסיר את השיוך";
    const refused = fakeDb({
      ...seo,
      "rpc:workshop_assign_client:error": locked,
    });
    const denied = (await executeApprovedWorkshopTool(
      refused,
      "tenant-1",
      "workshop_assign_client",
      { item_id: "item-2", client_id: "client-2" },
    )) as Record<string, unknown>;
    assertStrictEquals(denied.error, locked);

    const db = fakeDb({
      ...seo,
      "marketing_work_items:select": {
        ...seo["marketing_work_items:select"],
        client_id: null,
        payload: { department: "copy" },
      },
    });
    const done = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_assign_client",
      { item_id: "item-2", client_id: "client-2" },
    )) as Record<string, any>;
    assertStrictEquals(done.success, true);
    // No workshop board, so no assets tab to fill.
    assertStrictEquals(
      db.calls.some((c) => c.table === "workshop_assets"),
      false,
    );
  },
);

Deno.test(
  "assigning a client pulls the client's brief and site into the assets tab",
  async () => {
    const db = fakeDb({
      "marketing_work_items:select": {
        id: "item-1",
        title: "x",
        client_id: null,
        current_stage_id: null,
        payload: { workshop: {} },
      },
      "clients:select": {
        id: "client-3",
        name: "קפה הגינה",
        website: "garden.example.com",
        notes: "טון חם",
      },
    });
    const done = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_assign_client",
      { item_id: "item-1", client_id: "client-3" },
    )) as Record<string, any>;
    assertStrictEquals(done.client_assets, 2);
    const removed = db.calls.find(
      (c) => c.table === "workshop_assets" && c.op === "delete",
    );
    assert(removed, "old client assets are replaced");
    const rows = db.calls.find(
      (c) => c.table === "workshop_assets" && c.op === "insert",
    )?.value as Record<string, any>[];
    assertEquals(
      rows.map((r) => [r.asset_type, r.source]),
      [
        ["text", "client"],
        ["site", "client"],
      ],
    );

    const released = fakeDb(project);
    const away = (await executeApprovedWorkshopTool(
      released,
      "tenant-1",
      "workshop_assign_client",
      { item_id: "item-1" },
    )) as Record<string, any>;
    assertStrictEquals(away.client_assets, 0);
    assertStrictEquals(
      released.calls.some(
        (c) => c.table === "workshop_assets" && c.op === "insert",
      ),
      false,
    );
  },
);
