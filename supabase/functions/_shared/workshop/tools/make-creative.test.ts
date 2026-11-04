import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { executeWorkshopTool, fakeDb, project } from "./test-fakes.ts";

Deno.test(
  "creating images first asks for approval with the cost and spends nothing",
  async () => {
    let generated = 0;
    const db = fakeDb(project);
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", prompt: "festive table" },
      async () => {},
      null,
      {
        generateImage: async () => {
          generated += 1;
          return { image_url: "https://x/a.png" };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(result.needs_budget, true);
    assertEquals(result.formats, ["9:16", "4:5"]);
    assertStrictEquals(result.estimated_usd, 0.5);
    assertStrictEquals(generated, 0);
    assertStrictEquals(
      db.calls.some((c) => c.table === "workshop_artifacts"),
      false,
    );
  },
);

Deno.test(
  "after approval each format becomes a page and a failure is reported, not hidden",
  async () => {
    const db = fakeDb(project);
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", prompt: "festive table", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async (_prompt, format) =>
          format === "9:16"
            ? { image_url: "https://x/story.png" }
            : { error: "billing hard limit" },
      },
    )) as Record<string, any>;
    assertStrictEquals(result.success, true);
    assertStrictEquals(result.created, 1);
    assertEquals(result.failed, [
      { format: "4:5", error: "billing hard limit" },
    ]);
    const written = db.calls.filter(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "insert" &&
        !Array.isArray(c.value),
    );
    assertStrictEquals(written.length, 1);
    const row = written[0].value as Record<string, any>;
    assertStrictEquals(row.kind, "image");
    assertStrictEquals(row.folder, "images");
    assertStrictEquals(row.url, "https://x/story.png");
  },
);

Deno.test(
  "pictures in the making show as pending pages that become the finished ones",
  async () => {
    const db = fakeDb({
      ...project,
      "workshop_artifacts:update": {
        id: "workshop_artifacts-1",
        kind: "image",
        status: "ready",
      },
    });
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", prompt: "festive table", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async (_p: string, format: string) =>
          format === "9:16"
            ? { image_url: "https://x/story.png" }
            : { error: "billing hard limit" },
      },
    )) as Record<string, any>;
    const opened = db.calls.find(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "insert" &&
        Array.isArray(c.value),
    );
    const rows = opened?.value as Record<string, any>[];
    assertStrictEquals(rows.length, 2);
    assert(rows.every((row) => row.status === "pending"));
    assert(rows.every((row) => row.meta.placeholder === true));
    const updates = db.calls
      .filter((c) => c.table === "workshop_artifacts" && c.op === "update")
      .map((c) => c.value as Record<string, any>);
    assert(updates.some((u) => u.status === "ready" && u.url));
    assert(
      updates.some(
        (u) => u.status === "failed" && u.meta.text === "billing hard limit",
      ),
    );
    assertStrictEquals(result.created, 1);
    assertStrictEquals(
      db.calls.some(
        (c) =>
          c.table === "workshop_artifacts" &&
          c.op === "insert" &&
          !Array.isArray(c.value),
      ),
      false,
    );
  },
);

Deno.test(
  "pictures given to a tool as references also appear in the assets tab",
  async () => {
    const db = fakeDb({
      ...project,
      "workshop_assets:select": [{ id: "a", url: "https://x/old.png" }],
    });
    await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      {
        item_id: "item-1",
        prompt: "table",
        reference_urls: ["https://x/old.png", "https://x/new.png"],
      },
      async () => {},
      null,
      { generateImage: async () => ({ image_url: "https://x/a.png" }) },
    );
    const rows = db.calls.find(
      (c) => c.table === "workshop_assets" && c.op === "insert",
    )?.value as Record<string, any>[];
    assertEquals(
      rows.map((r) => r.url),
      ["https://x/new.png"],
    );
    assertStrictEquals(rows[0].use_as_reference, true);
  },
);

Deno.test(
  "with a background runner the picture request returns at once and the pages settle later",
  async () => {
    const db = fakeDb(project);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const background: Promise<unknown>[] = [];
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", prompt: "table", confirmed: true },
      async () => {},
      null,
      {
        background: (work) => background.push(work),
        generateImage: async () => {
          await gate;
          return { image_url: "https://x/a.png" };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(result.started, true);
    assertStrictEquals(result.pages, 2);
    assertStrictEquals(
      db.calls.some(
        (c) =>
          c.table === "workshop_artifacts" &&
          c.op === "update" &&
          (c.value as Record<string, unknown>).status === "ready",
      ),
      false,
      "nothing is settled before the pictures exist",
    );
    release();
    await Promise.all(background);
    const ready = db.calls.filter(
      (c) =>
        c.table === "workshop_artifacts" &&
        c.op === "update" &&
        (c.value as Record<string, unknown>).status === "ready",
    );
    assertStrictEquals(ready.length, 2);
  },
);
