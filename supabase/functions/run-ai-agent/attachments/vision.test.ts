import { assert, assertEquals } from "jsr:@std/assert@1";
import { MODEL_CATALOG } from "../../_shared/models.ts";
import {
  FAST_LANE_MODELS,
  LLM_FALLBACK_ORDER,
} from "../llm/fallback-models.ts";
import { enginesThatSee, targetCanSee } from "./vision.ts";

Deno.test("targetCanSee", async (t) => {
  await t.step(
    "follows the catalog's vision capability, model by model",
    () => {
      for (const model of MODEL_CATALOG) {
        assertEquals(
          targetCanSee({ label: model.id }),
          model.capabilities?.includes("vision") ?? false,
          model.id,
        );
      }
    },
  );

  await t.step("a model the catalog does not list cannot see", () => {
    assertEquals(targetCanSee({ label: "openai/gpt-unknown" }), false);
    assertEquals(targetCanSee({ label: "" }), false);
  });

  await t.step("a connected brain is never sent pictures", () => {
    assertEquals(
      targetCanSee({
        label: "google/gemini-3-flash-preview",
        connectionId: "c1",
      }),
      false,
    );
    assertEquals(
      targetCanSee({ label: "brain:openrouter/x", connectionId: "c2" }),
      false,
    );
  });

  // Why a picture turn is pinned off the fast lane, and why failover strips image parts.
  await t.step(
    "the fast lane and the failover chain hold a blind model",
    () => {
      assert(FAST_LANE_MODELS.some((label) => !targetCanSee({ label })));
      assert(LLM_FALLBACK_ORDER.some((label) => !targetCanSee({ label })));
      assert(targetCanSee({ label: LLM_FALLBACK_ORDER[0] }));
    },
  );
});

Deno.test("enginesThatSee names current catalog models that see", () => {
  const labels = enginesThatSee();

  assert(labels.length > 0);
  for (const label of labels) {
    const model = MODEL_CATALOG.find((entry) => entry.label === label);

    assert(model?.capabilities?.includes("vision"), label);
  }
});
