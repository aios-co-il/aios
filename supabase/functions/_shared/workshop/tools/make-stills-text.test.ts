import {
  assertMatch,
  assertNotMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  executeApprovedWorkshopTool,
  fakeDb,
  scene,
  videoProject,
} from "./test-fakes.ts";

/** The prompts workshop_make_stills sends for these scene descriptions. */
async function stillPrompts(visuals: Array<string>) {
  const db = fakeDb({
    ...videoProject(),
    "marketing_video_scenes:select": visuals.map((visual, at) =>
      scene(`s-${at + 1}`, { visual_prompt: visual, position: at + 1 }),
    ),
    "rpc:attach_video_scene_asset": { id: "asset-1" },
  });
  const prompts: Array<string> = [];
  await executeApprovedWorkshopTool(
    db,
    "tenant-1",
    "workshop_make_stills",
    { item_id: "item-1", confirmed: true },
    async () => {},
    null,
    {
      generateImage: async (prompt: string) => {
        prompts.push(prompt);
        return { image_url: `https://x/still-${prompts.length}.png` };
      },
    },
  );
  return prompts;
}

Deno.test(
  "a scene of labeled-looking nodes is asked for no letters and unlabeled shapes",
  async () => {
    // Staging, 5 Nov: this scene came back with "madix" and "salles" beside the nodes.
    const [nodes, person] = await stillPrompts([
      "Abstract glowing map on a dark navy background: a central bright node with five thin lines splitting outward to five glowing nodes. No text in the image.",
      "A young man in a navy shirt holds a glowing light in his palm.",
    ]);
    assertMatch(nodes, /no letters, no words, no numbers, no labels/);
    assertMatch(nodes, /no UI text/);
    assertMatch(nodes, /pure unlabeled shapes/);
    assertMatch(person, /no letters, no words/);
    assertNotMatch(person, /pure unlabeled shapes/);
  },
);

Deno.test(
  "quoted words in a scene description are not asked to be drawn",
  async () => {
    const [quoted] = await stillPrompts([
      'Carmen beside a wall that says "Sales" in big letters',
    ]);
    assertNotMatch(quoted, /Write each quoted text/);
    assertMatch(quoted, /No text on the image at all/);
    assertStrictEquals(quoted.includes("Sales"), true);
  },
);
