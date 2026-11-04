import { assertStrictEquals } from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
  scene,
} from "./test-fakes.ts";

Deno.test(
  "the closing call to action Carmen gives is kept for the film's end card",
  async () => {
    const db = fakeDb({
      ...videoProject(),
      "marketing_video_scenes:select": [scene("s-1", { still_asset_id: "a" })],
      "rpc:produce_video": { status: "running", clips: 1 },
    });
    const started = (await executeApprovedWorkshopTool(
      db,
      "tenant-1",
      "workshop_produce_video",
      { item_id: "item-1", confirmed: true, cta_text: "  מחכים לכם   בגפן " },
      async () => {},
      null,
      { defaultEngine: async () => "mock" as const },
    )) as Record<string, any>;
    assertStrictEquals(started.success, true);
    const saved = db.calls.find(
      (c) =>
        c.table === "marketing_work_items" &&
        c.op === "update" &&
        (c.value as Record<string, any>)?.payload?.cta_text,
    )?.value as Record<string, any>;
    assertStrictEquals(saved.payload.cta_text, "מחכים לכם בגפן");
  },
);

Deno.test(
  "the chosen ending decides the closing card, and the narration voice is saved",
  async () => {
    const produce = async (ending: string, extra: Record<string, unknown>) => {
      const base = videoProject() as Record<string, any>;
      base["marketing_work_items:select"].payload = {
        ...base["marketing_work_items:select"].payload,
        cta_text: "ישן",
        workshop_brief: { asked: true, answers: { סיום: ending } },
      };
      const db = fakeDb({
        ...base,
        "marketing_video_scenes:select": [
          scene("s-1", { still_asset_id: "a" }),
        ],
        "rpc:produce_video": { status: "running", clips: 1 },
      });
      await executeApprovedWorkshopTool(
        db,
        "tenant-1",
        "workshop_produce_video",
        { item_id: "item-1", confirmed: true, ...extra },
        async () => {},
        null,
        { defaultEngine: async () => "mock" as const },
      );
      return db.calls
        .filter((c) => c.table === "marketing_work_items" && c.op === "update")
        .map((c) => (c.value as Record<string, any>).payload)
        .find((p) => p && "end_card" in p);
    };
    const none = await produce("בלי סגיר", { cta_text: "בואו" });
    assertStrictEquals(none.end_card, false);
    assertStrictEquals("cta_text" in none, false);
    const logo = await produce("לוגו בלבד", { cta_text: "בואו" });
    assertStrictEquals(logo.end_card, true);
    assertStrictEquals("cta_text" in logo, false);
    const cta = await produce("לוגו וקריאה לפעולה", {
      cta_text: "בואו",
      voice_id: "ZiofZHcEBTn5sRySe5h8",
    });
    assertStrictEquals(cta.cta_text, "בואו");
    assertStrictEquals(cta.video.voice_id, "ZiofZHcEBTn5sRySe5h8");
  },
);
