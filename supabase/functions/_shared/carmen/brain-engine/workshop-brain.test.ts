import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { describe, it } from "jsr:@std/testing@1/bdd";
import type { BrainEngine } from "./load.ts";
import {
  withInternalFallback,
  workshopDefaultApplies,
} from "./workshop-brain.ts";

const workshop = { task_skills: ["carmen_workshop"], tenant_id: "t-1" };

describe("workshopDefaultApplies", () => {
  it("applies to a workshop turn where the user picked no brain", () => {
    assertStrictEquals(workshopDefaultApplies(workshop), true);
  });

  it("keeps the brain the user picked, and leaves other chats and WhatsApp alone", () => {
    assertStrictEquals(
      workshopDefaultApplies({ ...workshop, brain_slug: "groq" }),
      false,
    );
    assertStrictEquals(workshopDefaultApplies({ tenant_id: "t-1" }), false);
    assertStrictEquals(
      workshopDefaultApplies({ ...workshop, surface: "whatsapp" }),
      false,
    );
  });
});

describe("withInternalFallback", () => {
  const openRouter: BrainEngine = {
    kind: "connections",
    slug: "openrouter",
    targets: [],
    fallbackInternal: false,
  };

  it("runs the default brain with Carmen's engine after it when that is granted", () => {
    assertEquals(withInternalFallback(openRouter, true), {
      ...openRouter,
      fallbackInternal: true,
    });
    assertEquals(withInternalFallback(openRouter, false), openRouter);
  });

  it("runs Carmen's engine when the default brain cannot run", () => {
    for (const engine of [
      { kind: "denied" },
      { kind: "refused", message: "not ready" },
      { kind: "internal" },
    ] as BrainEngine[]) {
      assertEquals(withInternalFallback(engine, true), { kind: "internal" });
    }
  });
});
