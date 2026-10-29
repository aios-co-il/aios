import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { STILLS_QUESTION } from "./stills-approval.ts";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  scene,
  videoProject,
} from "./test-fakes.ts";

/** payload.video as make_stills saved it. */
interface SavedVideo {
  payload?: {
    video?: { asked_stills?: Array<string>; asked_stills_turn?: string };
  };
}

/** The last scene picture made in `mode`, in turn-1. */
async function lastPicture(mode: "auto" | "semi") {
  const project = videoProject();
  const item = project["marketing_work_items:select"];
  const db = fakeDb({
    ...project,
    "marketing_work_items:select": {
      ...item,
      payload: { ...item.payload, workshop_mode: mode },
    },
    // The fake board answers the same after the picture: the stills shown are the ones it holds.
    "marketing_video_scenes:select": [
      scene("s-1", { still_asset_id: "a" }),
      scene("s-2"),
    ],
    "rpc:attach_video_scene_asset": { id: "b" },
  });
  const reply = (await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    {
      turnId: "turn-1",
      generateImage: async () => ({ image_url: "https://x/1.png" }),
    },
  )) as { say_to_user?: string };
  const asked = db.calls
    .filter((c) => c.table === "marketing_work_items" && c.op === "update")
    .map((c) => (c.value as SavedVideo).payload?.video)
    .find((video) => video?.asked_stills);
  return { reply, asked };
}

Deno.test(
  "semi-automatic: the last picture asks, and records the stills shown and the turn",
  async () => {
    const { reply, asked } = await lastPicture("semi");
    assertStrictEquals(reply.say_to_user, STILLS_QUESTION);
    assertEquals(asked?.asked_stills, ["a"]);
    assertStrictEquals(asked?.asked_stills_turn, "turn-1");
  },
);

Deno.test("automatic mode asks nothing after the last picture", async () => {
  const { reply, asked } = await lastPicture("auto");
  assertStrictEquals(reply.say_to_user, undefined);
  assertStrictEquals(asked, undefined);
});
