import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  CREATIVE_STUDIO_TOOLS,
  executeCreativeStudioTool,
  isCreativeStudioTool,
  missingForStudio,
} from "./creative-studio-tools.ts";

/** Chainable stand-in for the Supabase query builder; records every call. */
function fakeDb(tables: Record<string, unknown[]>) {
  const calls: {
    table: string;
    op: string;
    payload?: unknown;
    filters: string[];
  }[] = [];
  const from = (table: string) => {
    const call = {
      table,
      op: "select",
      payload: undefined as unknown,
      filters: [] as string[],
    };
    calls.push(call);
    const rows = () => {
      let list = [...(tables[table] ?? [])] as Record<string, unknown>[];
      for (const f of call.filters) {
        const [key, value] = f.split("=");
        list = list.filter((row) => String(row[key]) === value);
      }
      return list;
    };
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (key: string, value: unknown) => (
        call.filters.push(`${key}=${value}`),
        q
      ),
      order: () => q,
      update: (payload: unknown) => (
        (call.op = "update"),
        (call.payload = payload),
        q
      ),
      insert: (payload: unknown) => (
        (call.op = "insert"),
        (call.payload = payload),
        q
      ),
      delete: () => ((call.op = "delete"), q),
      single: async () => ({ data: { id: "new-scene" }, error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: call.op === "select" ? rows() : null,
          error: null,
        }).then(resolve),
    };
    return q;
  };
  return { db: { from }, calls };
}

const videoItem = {
  id: "item-1",
  tenant_id: "t1",
  title: "פרומו",
  client_id: "c1",
  current_stage_id: "s1",
  payload: {
    project_type: "video",
    format: "9:16",
    video: { scene_engine: "mock" },
  },
};
const scenes = [
  {
    id: "sc1",
    item_id: "item-1",
    tenant_id: "t1",
    position: 1,
    title: "פתיחה",
    status: "still_ready",
    still_asset_id: "a",
  },
  {
    id: "sc2",
    item_id: "item-1",
    tenant_id: "t1",
    position: 2,
    title: "סיום",
    status: "draft",
  },
];

Deno.test("every studio tool has a schema and is recognised", () => {
  assertStrictEquals(CREATIVE_STUDIO_TOOLS.length, 7);
  for (const tool of CREATIVE_STUDIO_TOOLS)
    assert(isCreativeStudioTool(tool.name));
  assertStrictEquals(isCreativeStudioTool("render_video_film"), false);
});

Deno.test(
  "a project outside the tenant or the caller's clients is refused",
  async () => {
    const { db } = fakeDb({ marketing_work_items: [videoItem] });
    assertEquals(
      await executeCreativeStudioTool(db, "other-tenant", "get_studio_state", {
        item_id: "item-1",
      }),
      { error: "פרויקט לא נמצא" },
    );
    const denied = await executeCreativeStudioTool(
      db,
      "t1",
      "get_studio_state",
      { item_id: "item-1" },
      async () => {
        throw new Error("אין גישה");
      },
    );
    assertEquals(denied, { error: "אין גישה" });
  },
);

Deno.test("studio state lists scenes and what is missing", async () => {
  const { db } = fakeDb({
    marketing_work_items: [videoItem],
    marketing_video_scenes: scenes,
  });
  const state = (await executeCreativeStudioTool(db, "t1", "get_studio_state", {
    item_id: "item-1",
  })) as Record<string, unknown>;
  assertStrictEquals(state.mode, "video");
  assertStrictEquals((state.scenes as unknown[]).length, 2);
  assertEquals(state.missing, ["לוגו", "רפרנס סגנון (תמונה או מודעה קודמת)"]);
});

Deno.test(
  "settings and attachments are merged into the payload, invalid values ignored",
  async () => {
    const { db, calls } = fakeDb({ marketing_work_items: [videoItem] });
    const result = await executeCreativeStudioTool(
      db,
      "t1",
      "update_studio_settings",
      {
        item_id: "item-1",
        scene_engine: "elevenlabs",
        still_model: "midjourney",
      },
    );
    assertEquals(result, {
      updated: true,
      changed: ["מנוע הנפשה elevenlabs"],
    });
    const saved = calls.find((c) => c.op === "update")!.payload as {
      payload: Record<string, unknown>;
    };
    assertStrictEquals(
      (saved.payload.video as Record<string, unknown>).scene_engine,
      "elevenlabs",
    );
    assert(saved.payload.project_type === "video");

    const { db: db2, calls: calls2 } = fakeDb({
      marketing_work_items: [videoItem],
    });
    await executeCreativeStudioTool(db2, "t1", "attach_to_project", {
      item_id: "item-1",
      role: "character",
      file_url: "https://x.supabase.co/storage/v1/object/sign/a.png",
    });
    const saved2 = calls2.find((c) => c.op === "update")!.payload as {
      payload: Record<string, unknown>;
    };
    assertStrictEquals(
      (saved2.payload.video as Record<string, unknown>).character_ref_url,
      "https://x.supabase.co/storage/v1/object/sign/a.png",
    );
    assertEquals(
      await executeCreativeStudioTool(db2, "t1", "attach_to_project", {
        item_id: "item-1",
        role: "logo",
        file_url: "javascript:alert(1)",
      }),
      { error: "file_url חייב להיות קישור https" },
    );
  },
);

Deno.test(
  "scene edits target the scene by number inside the tenant, deletes need confirmation",
  async () => {
    const { db, calls } = fakeDb({
      marketing_work_items: [videoItem],
      marketing_video_scenes: scenes,
    });
    const edited = (await executeCreativeStudioTool(db, "t1", "edit_scene", {
      item_id: "item-1",
      scene_number: 2,
      overlay_text: "מבצע השקה",
    })) as Record<string, unknown>;
    assertStrictEquals(edited.updated, true);
    const update = calls.find((c) => c.op === "update")!;
    assertEquals(update.payload, { overlay_text: "מבצע השקה" });
    assert(
      update.filters.includes("id=sc2") &&
        update.filters.includes("tenant_id=t1"),
    );

    const ask = (await executeCreativeStudioTool(db, "t1", "delete_scene", {
      item_id: "item-1",
      scene_number: 1,
    })) as Record<string, unknown>;
    assertStrictEquals(ask.needs_confirmation, true);
    assert(!calls.some((c) => c.op === "delete"));
  },
);

Deno.test(
  "ui actions are validated for the project's mode and carry the target",
  async () => {
    const { db } = fakeDb({
      marketing_work_items: [videoItem],
      marketing_video_scenes: scenes,
    });
    const animate = (await executeCreativeStudioTool(
      db,
      "t1",
      "studio_ui_action",
      {
        item_id: "item-1",
        action: "animate_scene",
        scene_number: 1,
      },
    )) as Record<string, unknown>;
    assertEquals(animate.ui_action, {
      type: "animate_scene",
      item_id: "item-1",
      scene_id: "sc1",
    });
    assertEquals(
      await executeCreativeStudioTool(db, "t1", "studio_ui_action", {
        item_id: "item-1",
        action: "generate_variations",
      }),
      { error: "הפעולה הזו היא לפוסט סטטי, והפרויקט סרטון" },
    );
  },
);

Deno.test("missing items for a static post ask for copy or a brief", () => {
  assertEquals(
    missingForStudio(
      { logo_url: "u", style_references: [{ url: "r" }] },
      { scenes: 0, copy: 0 },
    ),
    ["קופי או בריף"],
  );
});
