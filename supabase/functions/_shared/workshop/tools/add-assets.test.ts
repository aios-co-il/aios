import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { fallbackReply, shouldNudgeSilentTurn } from "../reply.ts";
import { importWebImage } from "./add-assets.ts";
import { executeWorkshopTool, fakeDb, project, encode } from "./test-fakes.ts";

Deno.test(
  "Carmen adds a site picture as a stored reference, a link and a brief; a bad picture is reported",
  async () => {
    const imported: string[] = [];
    const db = fakeDb(project);
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_add_assets",
      {
        item_id: "item-1",
        assets: [
          {
            kind: "image",
            url: "https://garden.example.com/hero.jpg",
            use_as_reference: true,
          },
          { kind: "image", url: "https://garden.example.com/broken.jpg" },
          { kind: "link", url: "https://docs.google.com/d/1", title: "בריף" },
          { kind: "text", text: "טון חם ופשוט", title: "הנחיות" },
          { kind: "image", url: "ftp://x/y.png" },
        ],
      },
      async () => {},
      null,
      {
        importImage: async (url) => {
          imported.push(url);
          return url.includes("broken")
            ? { error: "הקובץ אינו תמונה נתמכת" }
            : {
                url: "https://files.test/hero.jpg",
                path: "tenant-1/workshop/hero.jpg",
              };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(result.success, true);
    assertEquals(
      result.added.map((a: any) => a.type),
      ["image", "link", "text"],
    );
    assertStrictEquals(result.failed.length, 2);
    const rows = db.calls
      .filter((c) => c.table === "workshop_assets" && c.op === "insert")
      .map((c) => c.value as Record<string, any>);
    const image = rows.find((r) => r.asset_type === "image");
    assertStrictEquals(image?.url, "https://files.test/hero.jpg");
    assertStrictEquals(image?.use_as_reference, true);
    assertStrictEquals(image?.source, "carmen");
    assertEquals(imported, [
      "https://garden.example.com/hero.jpg",
      "https://garden.example.com/broken.jpg",
    ]);
  },
);

Deno.test(
  "when no picture could be copied, the failure is an error the turn reports instead of retrying",
  async () => {
    const reason = "peer closed connection without sending TLS close_notify";
    const addAssets = async (assets: Array<Record<string, unknown>>) =>
      (await executeWorkshopTool(
        fakeDb(project),
        "tenant-1",
        "workshop_add_assets",
        { item_id: "item-1", assets },
        async () => {},
        null,
        { importImage: async () => ({ error: reason }) },
      )) as {
        success: boolean;
        added: Array<unknown>;
        failed: Array<{ reason: string }>;
        error?: string;
      };
    const result = await addAssets([
      { kind: "image", url: "https://app.example.com/skins/a.webp" },
      { kind: "image", url: "https://app.example.com/skins/b.webp" },
    ]);
    assertStrictEquals(result.success, false);
    // The user hears a short line; Carmen keeps the raw reasons.
    assertStrictEquals(result.error, "הורדת התמונות לפרויקט נכשלה");
    assertEquals(
      result.failed.map((f) => f.reason),
      [reason, reason],
    );
    assertStrictEquals(
      shouldNudgeSilentTurn([{ tool: "workshop_add_assets", result }]),
      false,
    );
    assertStrictEquals(
      fallbackReply([{ tool: "workshop_add_assets", result }], {
        outOfSteps: true,
      }),
      "לא הצלחתי להשלים: הורדת התמונות לפרויקט נכשלה",
    );

    // Something kept is not an error, even beside a picture that failed.
    const partly = await addAssets([
      { kind: "link", url: "https://docs.google.com/d/1", title: "בריף" },
      { kind: "image", url: "https://app.example.com/skins/a.webp" },
    ]);
    assertStrictEquals(partly.success, true);
    assertStrictEquals(partly.error, undefined);
  },
);

/** Storage that records uploads and answers public links as Supabase does. */
function fakeStorage() {
  const uploads: { bucket: string; path: string; contentType?: string }[] = [];
  return {
    uploads,
    storage: {
      from: (bucket: string) => ({
        upload: (
          path: string,
          _bytes: Uint8Array,
          options?: { contentType?: string },
        ) => {
          uploads.push({ bucket, path, contentType: options?.contentType });
          return Promise.resolve({ error: null });
        },
        getPublicUrl: (path: string) => ({
          data: {
            publicUrl: `https://p.supabase.co/storage/v1/object/public/${bucket}/${path}`,
          },
        }),
      }),
    },
  };
}

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

Deno.test(
  "a picture copied from the web is kept where every reader can fetch it, not in the private bucket",
  async () => {
    const { storage, uploads } = fakeStorage();
    const imported = await importWebImage(
      { storage },
      async (url) => ({
        ok: true,
        url,
        contentType: "image/png",
        bytes: PNG_BYTES,
      }),
      "https://garden.example.com/logo.png",
      { tenantId: "tenant-1", itemId: "item-1" },
    );
    assertStrictEquals(uploads.length, 1);
    assertStrictEquals(uploads[0].bucket, "social-media");
    assertMatch(
      uploads[0].path,
      /^workshop-imports\/tenant-1\/item-1\/[^/]+\.png$/,
    );
    assertStrictEquals(uploads[0].contentType, "image/png");
    // A public link: image references, the film's end card and the board read it as it is.
    assertStrictEquals(
      imported.url,
      `https://p.supabase.co/storage/v1/object/public/social-media/${uploads[0].path}`,
    );

    const refused = await importWebImage(
      { storage },
      async (url) => ({
        ok: true,
        url,
        contentType: "text/html",
        bytes: encode("<html></html>"),
      }),
      "https://garden.example.com/",
      { tenantId: "tenant-1", itemId: "item-1" },
    );
    assertMatch(String(refused.error), /אינו תמונה נתמכת/);
    assertStrictEquals(uploads.length, 1);
  },
);

Deno.test(
  "an uploaded picture the user names as the logo becomes the project's logo",
  async () => {
    const db = fakeDb({
      ...project,
      "workshop_assets:select": [
        {
          id: "a-1",
          asset_type: "image",
          url: "https://files.test/wordmark.png",
        },
      ],
    });
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_add_assets",
      {
        item_id: "item-1",
        assets: [
          {
            kind: "image",
            url: "https://files.test/wordmark.png",
            use_as_logo: true,
          },
        ],
      },
      async () => {},
      null,
      {
        importImage: async () => {
          throw new Error("an uploaded picture is not imported again");
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(result.logo_url, "https://files.test/wordmark.png");
    assertMatch(result.message, /הלוגו נשמר לפרויקט/);
    const saved = db.calls
      .filter((c) => c.table === "marketing_work_items" && c.op === "update")
      .map((c) => (c.value as Record<string, any>).payload);
    assertStrictEquals(
      saved[saved.length - 1].logo_url,
      "https://files.test/wordmark.png",
    );
    const inserted = db.calls.filter(
      (c) => c.table === "workshop_assets" && c.op === "insert",
    );
    assertStrictEquals(inserted.length, 0);
  },
);
