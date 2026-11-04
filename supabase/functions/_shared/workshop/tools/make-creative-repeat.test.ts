import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { executeWorkshopTool, fakeDb, project } from "./test-fakes.ts";

Deno.test(
  "approving without repeating the prompt reuses the remembered one",
  async () => {
    const db = fakeDb({
      "marketing_work_items:select": {
        id: "item-1",
        title: "מסעדה",
        client_id: null,
        payload: {
          workshop_brief: { asked: true },

          workshop_look: {
            film: "cinematic, calm, female narrator",
            bible: "warm bistro look",
          },
          workshop_last_prompt: "a plated pasta dish, warm light",
        },
      },
    });
    const prompts: string[] = [];
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async (prompt: string) => {
          prompts.push(prompt);
          return { image_url: "https://x/a.png" };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals("error" in result, false);
    assertMatch(prompts[0], /plated pasta dish/);
  },
);

Deno.test(
  "with no prompt anywhere the title and style bible stand in",
  async () => {
    const db = fakeDb({
      "marketing_work_items:select": {
        id: "item-1",
        title: "מסעדה",
        client_id: null,
        payload: {
          workshop_brief: { asked: true },

          workshop_look: {
            film: "cinematic, calm, female narrator",
            bible: "warm bistro look",
          },
        },
      },
    });
    const prompts: string[] = [];
    await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async (prompt: string) => {
          prompts.push(prompt);
          return { image_url: "https://x/a.png" };
        },
      },
    );
    assertMatch(prompts[0], /מסעדה/);
    assertMatch(prompts[0], /warm bistro look/);
  },
);

Deno.test(
  "a second request while pictures are still being made does not pay twice",
  async () => {
    let generated = 0;
    const db = fakeDb({
      ...project,
      "workshop_artifacts:select": [{ id: "pending-1" }],
    });
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", prompt: "table", confirmed: true },
      async () => {},
      null,
      {
        generateImage: async () => {
          generated += 1;
          return { image_url: "https://x/a.png" };
        },
      },
    )) as Record<string, any>;
    assertStrictEquals(result.already_running, true);
    assertStrictEquals(generated, 0);
  },
);

Deno.test(
  "a film project with scenes still missing pictures is sent to the scene tool",
  async () => {
    const db = fakeDb({
      "marketing_work_items:select": {
        id: "item-1",
        title: "סרט",
        client_id: null,
        payload: {
          project_type: "video",
          workshop_brief: { asked: true },

          workshop_look: {
            film: "cinematic, calm, female narrator",
            bible: "look",
          },
        },
      },
      "marketing_video_scenes:select": [
        { id: "s1", position: 1, still_asset_id: null },
      ],
    });
    const result = (await executeWorkshopTool(
      db,
      "tenant-1",
      "workshop_make_creative",
      { item_id: "item-1", prompt: "scene", confirmed: true },
      async () => {},
      null,
      { generateImage: async () => ({ image_url: "https://x/a.png" }) },
    )) as Record<string, any>;
    assertMatch(result.error, /workshop_make_stills/);
  },
);
