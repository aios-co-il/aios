import { describe, expect, test } from "vitest";
import { generateClip } from "../src/jobs/clip.ts";
import {
  clipNegativePrompt,
  PERSON_LOCK,
  PERSON_NEGATIVE,
  showsPerson,
  TEXT_NEGATIVE,
} from "../src/providers/composed-motion.ts";
import { higgsfieldClipBody } from "../src/providers/higgsfield.ts";
import { clipPrompt, talkingPrompt } from "../src/providers/index.ts";

/** The run's item, scene and still for tenant t1, as the clip job's guard reads them. */
function fakeDb() {
  return {
    download: async () => new Uint8Array([1]),
    select: async (table, query) => {
      if (table === "marketing_work_items") {
        return [{ id: "i1", tenant_id: "t1", client_id: "c1" }];
      }
      if (table === "marketing_video_scenes") {
        return [{ id: "s1", still_asset_id: "still-1", meta: {} }];
      }
      if (table === "marketing_assets" && query.includes("id=eq.still-1")) {
        return [{ id: "still-1", url: "t1/c1/i1/still.png" }];
      }
      return [];
    },
    upload: async () => {},
    sign: async (_bucket, path) => `https://p.supabase.co/sign/${path}`,
    rpc: async () => {},
    update: async () => {},
  };
}

/** What a clip run of `motion` sends its engine (the job then fails at the first poll). */
async function submitted(motion) {
  const submits = [];
  const provider = {
    name: "kling",
    model: "m",
    estimate: () => ({ credits: 0, usd: 0 }),
    submit: async (input) => (submits.push(input), { jobId: "job-1" }),
    poll: async () => ({ status: "failed", error: "stop" }),
  };
  const run = {
    id: "run-1",
    tenant_id: "t1",
    item_id: "i1",
    scene_id: "s1",
    kind: "clip",
    input: { motion_prompt: motion, duration_s: 5, aspect: "9:16" },
  };
  await generateClip({ db: fakeDb(), run, provider, log: () => {} }).catch(
    () => {},
  );
  return submits[0];
}

describe("composed motion (David, Nov 2026: Carmen's clips looked like a model posing)", () => {
  test("a clip with a person sends the fashion exclusions to the negative field", async () => {
    const input = await submitted("She points at the chart and holds.");
    expect(input.negativePrompt).toBe(`${TEXT_NEGATIVE}, ${PERSON_NEGATIVE}`);
    expect(input.negativePrompt).toMatch(/fashion pose, hair flip/);
    expect(input.prompt).toContain(PERSON_LOCK);
  });

  test("a product clip keeps the text exclusions only", async () => {
    const input = await submitted("The bottle spins slowly on a turntable.");
    expect(input.negativePrompt).toBe(TEXT_NEGATIVE);
    expect(input.prompt).not.toContain(PERSON_LOCK);
  });

  test("engines without a negative field get the lock in the prompt", () => {
    expect(clipPrompt("Carmen nods once.")).toBe(
      `Carmen nods once. ${PERSON_LOCK} No text, no letters, no logos.`,
    );
    expect(talkingPrompt("", { line: "שלום" })).toContain(PERSON_LOCK);
    expect(showsPerson("Slow push-in on the laptop.")).toBe(false);
    expect(showsPerson("", true)).toBe(true);
    expect(clipNegativePrompt(false)).toBe(TEXT_NEGATIVE);
  });

  test("Higgsfield sends the clip's negative prompt", () => {
    const body = higgsfieldClipBody({
      prompt: "move",
      imageUrl: "https://files.example/still.png",
      negativePrompt: clipNegativePrompt(true),
    });
    expect(body.negative_prompt).toMatch(/runway walk/);
  });
});
