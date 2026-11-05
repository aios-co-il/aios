import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { ToolContext } from "../tool-context.ts";
import { gateProduction } from "./produce-video-gate.ts";
import { quoteProduction } from "./produce-video-quote.ts";
import { fakeDb, scene } from "./test-fakes.ts";

const ctx = (): ToolContext => ({
  supabase: fakeDb({ "marketing_assets:select": [] }),
  tenantId: "tenant-1",
  name: "workshop_produce_video",
  args: {},
  assertClientAccess: async () => {},
  userId: null,
  deps: {},
});

const scenes = [scene("s-1"), scene("s-2")];

describe("gateProduction", () => {
  it("asks for the budget with the engine and what the film adds", async () => {
    const context = ctx();
    const quote = await quoteProduction(context, {
      itemId: "item-1",
      payload: { project_type: "video" },
      video: { voice_id: "d4eLZ8u5dfBCsjp4YPyz" },
      scenes,
      engine: "kling",
      animated: scenes,
      relip: [],
    });
    const gate = await gateProduction(
      context,
      "item-1",
      { project_type: "video" },
      { engine: "kling", scenes: scenes.length, quote },
    );
    if (!("stop" in gate)) {
      throw new Error("expected the budget question");
    }
    assertStrictEquals(gate.stop.needs_budget, true);
    assertStrictEquals(gate.stop.engine_label, "Kling");
    assertStrictEquals(gate.stop.scenes, 2);
    assertStrictEquals(gate.stop.estimated_usd, quote.estimate.totalUsd);
    assertMatch(String(gate.stop.say_to_user), /\$/);
  });
});
