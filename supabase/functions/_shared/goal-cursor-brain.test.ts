import { assertStringIncludes } from "jsr:@std/assert@1";

import {
  extractJsonFromBrainResponse,
  buildGoalBrainCallbackBlock,
} from "./goal-cursor-brain.ts";
import { withRuntime } from "./testing/served-handler.ts";

Deno.test("extractJsonFromBrainResponse parses fenced JSON", () => {
  const raw = 'Here is the plan:\n```json\n{"plan_steps":[{"title":"A"}]}\n```';
  const parsed = extractJsonFromBrainResponse(raw);
  if (!parsed?.plan_steps) {
    throw new Error("expected plan_steps");
  }
  if (!Array.isArray(parsed.plan_steps)) {
    throw new Error("plan_steps not array");
  }
});

Deno.test("extractJsonFromBrainResponse parses bare JSON", () => {
  const parsed = extractJsonFromBrainResponse('{"efficient":true,"score":90}');
  if (!parsed?.efficient) {
    throw new Error("expected efficient");
  }
});

Deno.test("buildGoalBrainCallbackBlock includes callback URL", () => {
  const block = buildGoalBrainCallbackBlock({
    requestId: "req-1",
    tenantId: "t1",
    goalId: "g1",
    token: "tok",
  });
  if (!block.includes("goal-brain-callback")) {
    throw new Error("missing callback path");
  }
  if (!block.includes("req-1")) {
    throw new Error("missing request id");
  }
});

Deno.test(
  "buildGoalBrainCallbackBlock posts back to PUBLIC_API_URL",
  async () => {
    const block = await withRuntime(
      {
        env: {
          PUBLIC_API_URL: "https://api.aios.co.il",
          SUPABASE_URL: "https://ref.supabase.co",
        },
        fetch: globalThis.fetch,
      },
      () =>
        Promise.resolve(
          buildGoalBrainCallbackBlock({
            requestId: "req-1",
            tenantId: "t1",
            goalId: "g1",
            token: "tok",
          }),
        ),
    );

    assertStringIncludes(
      block,
      "POST https://api.aios.co.il/functions/v1/goal-brain-callback\n",
    );
  },
);
