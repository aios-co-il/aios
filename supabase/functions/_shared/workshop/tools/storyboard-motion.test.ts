/**
 * workshop_storyboard directs motion like a marketing manager, not a fashion model (David, Nov
 * 2026: "Carmen's animations look like a fashion model"): the guide is in the tool and a person
 * scene whose motion asks for posing is sent back with its number.
 */
import {
  assert,
  assertMatch,
  assertStrictEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { MOTION_DIRECTION_GUIDE } from "../motion-direction.ts";
import { STORYBOARD_TOOL } from "../tool-definitions-storyboard.ts";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  videoProject,
} from "./test-fakes.ts";

const PROFESSIONAL =
  "Slow push-in. Carmen faces the laptop. She points at the rising line on the chart and holds. Ends with her finger on the chart, eyes on the screen.";

/** workshop_storyboard on a film ready for scenes, with `scenes` as Carmen wrote them. */
async function storyboard(scenes: Array<Record<string, unknown>>) {
  const db = fakeDb(videoProject());
  const result = (await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_storyboard",
    { item_id: "item-1", scenes },
  )) as Record<string, unknown>;
  const saved = db.calls.some((c) => c.table === "rpc:save_video_storyboard");
  return { result, saved };
}

Deno.test(
  "a person scene that poses like a model is refused with its number",
  async () => {
    const { result, saved } = await storyboard([
      { visual_prompt: "Carmen at her desk", motion_prompt: PROFESSIONAL },
      {
        visual_prompt: "Carmen in a blazer in the office",
        motion_prompt:
          "She strikes a pose and flips her hair toward the camera.",
      },
    ]);
    assertMatch(String(result.error), /^סצנה 2: /);
    assertMatch(String(result.error), /strikes a pose/);
    assertStrictEquals(saved, false);
  },
);

Deno.test("professional motion with a named end pose is saved", async () => {
  const { result, saved } = await storyboard([
    {
      visual_prompt: "Carmen at her desk",
      motion_prompt: `${PROFESSIONAL} She ends in a calm end pose.`,
    },
    // A product may spin: no one is in the shot.
    {
      visual_prompt: "a bottle of olive oil on a marble counter",
      motion_prompt: "The bottle spins slowly on a turntable.",
    },
  ]);
  assertStrictEquals(result.error, undefined);
  assertStrictEquals(result.scenes, 2);
  assert(saved);
});

Deno.test("the storyboard tool carries the director's guide", () => {
  const motion =
    STORYBOARD_TOOL.parameters.properties.scenes.items.properties.motion_prompt
      .description;
  assertStringIncludes(motion, MOTION_DIRECTION_GUIDE);
  assertStringIncludes(motion, "בלי טקסט");
  assertStringIncludes(STORYBOARD_TOOL.description, "לא כמו דוגמנית");
});
