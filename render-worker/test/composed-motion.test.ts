import { describe, expect, test } from "vitest";
import { generateClip } from "../src/jobs/clip.ts";
import {
  CARMEN_LOCK,
  CARMEN_NEGATIVE,
  clipNegativePrompt,
  showsCarmen,
  TEXT_NEGATIVE,
} from "../src/providers/composed-motion.ts";
import { higgsfieldClipBody } from "../src/providers/higgsfield.ts";
import { clipPrompt, talkingPrompt } from "../src/providers/index.ts";
import { textlessMotion } from "../src/providers/textless-motion.ts";

/** The run's item, `scene` and still for tenant t1, as the clip job's guard reads them. */
function fakeDb(scene = {}) {
  return {
    download: async () => new Uint8Array([1]),
    select: async (table, query) => {
      if (table === "marketing_work_items") {
        return [{ id: "i1", tenant_id: "t1", client_id: "c1" }];
      }
      if (table === "marketing_video_scenes") {
        return [{ id: "s1", still_asset_id: "still-1", meta: {}, ...scene }];
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

/** What a clip run of `motion` on `scene` sends its engine (the job then fails at the first poll). */
async function submitted(motion, scene = {}) {
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
  await generateClip({ db: fakeDb(scene), run, provider, log: () => {} }).catch(
    () => {},
  );
  return submits[0];
}

describe("composed motion (David, Nov 2026: Carmen's clips looked like a model posing)", () => {
  test("a clip of Carmen sends the fashion exclusions to the negative field", async () => {
    const input = await submitted("She points at the chart and holds.", {
      visual_prompt: "Carmen at her desk with a laptop",
    });
    expect(input.negativePrompt).toBe(`${TEXT_NEGATIVE}, ${CARMEN_NEGATIVE}`);
    expect(input.negativePrompt).toMatch(/fashion pose, hair flip/);
    expect(input.prompt).toContain(CARMEN_LOCK);
  });

  test("Carmen's skin portrait as the scene's reference makes it hers", async () => {
    const input = await submitted("She looks up and nods.", {
      visual_prompt: "a woman at a desk",
      meta: {
        reference_url: "https://app.aios.co.il/brand/carmen/skins/analyst.webp",
      },
    });
    expect(input.negativePrompt).toMatch(/runway walk/);
  });

  test("a client's model gets no fashion exclusions", async () => {
    const input = await submitted("The model poses in the new dress.", {
      visual_prompt: "a fashion model in a red dress on a studio set",
      meta: { speaker: "Dana" },
    });
    expect(input.negativePrompt).toBe(TEXT_NEGATIVE);
    expect(input.prompt).not.toContain(CARMEN_LOCK);
  });

  test("a product clip keeps the text exclusions only", async () => {
    const input = await submitted("The bottle spins slowly on a turntable.");
    expect(input.negativePrompt).toBe(TEXT_NEGATIVE);
    expect(input.prompt).not.toContain(CARMEN_LOCK);
  });

  test("Carmen named only in a text sentence the engine never gets does not count", () => {
    expect(
      showsCarmen({
        motion: textlessMotion("The caption says Carmen. The cup steams."),
      }),
    ).toBe(false);
    expect(showsCarmen({ motion: "כרמן מהנהנת." })).toBe(true);
    expect(showsCarmen({ meta: { skin_switch: true } })).toBe(true);
  });

  test("engines without a negative field get the lock in the prompt", () => {
    expect(clipPrompt("Carmen nods once.", true)).toBe(
      `Carmen nods once. ${CARMEN_LOCK} No text, no letters, no logos.`,
    );
    expect(clipPrompt("She nods once.")).not.toContain(CARMEN_LOCK);
    expect(talkingPrompt("", { line: "שלום" }, true)).toContain(CARMEN_LOCK);
    expect(talkingPrompt("", { line: "שלום" })).not.toContain(CARMEN_LOCK);
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
