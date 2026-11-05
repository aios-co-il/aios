import { assert, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { ToolContext } from "../tool-context.ts";
import { gateStills } from "./make-stills-gate.ts";
import { fakeDb, scene } from "./test-fakes.ts";

/** A context on a fake client with no budget approved yet. */
const ctx = (): ToolContext => ({
  supabase: fakeDb(),
  tenantId: "tenant-1",
  name: "workshop_make_stills",
  args: {},
  assertClientAccess: async () => {},
  userId: null,
  deps: { defaultEngine: async () => "mock" as const },
});

const scenes = [scene("s-1"), scene("s-2"), scene("s-3")];

describe("gateStills", () => {
  it("asks for one budget for the pictures and the film, with this call's share", async () => {
    const gate = await gateStills(ctx(), {
      itemId: "item-1",
      payload: { project_type: "video" },
      scenes,
      pending: scenes,
      batch: scenes.slice(0, 2),
      format: "9:16",
      engine: null,
    });
    if (!("stop" in gate)) {
      throw new Error("expected the budget question");
    }
    const offer = gate.stop;
    assertStrictEquals(offer.scenes, 3);
    assertStrictEquals(offer.this_call, 2);
    assertStrictEquals(offer.needs_budget, true);
    // The proposed budget covers the three pictures and the film that follows them.
    assert(Number(offer.proposed_budget_usd) > Number(offer.estimated_usd));
  });
});
