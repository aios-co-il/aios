import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { executeUpdateSkill } from "./update-skill.ts";
import { executorClient } from "./executor-client.test-fixture.ts";

Deno.test(
  "update-skill surfaces database failures instead of reporting missing data",
  async () => {
    const fixture = executorClient(
      [{ message: "database failed" }, { message: "fallback failed" }],
      500,
    );
    await assertRejects(() =>
      executeUpdateSkill({ skill_id: "skill", body: "test" }, fixture.context),
    );
    assertEquals(
      fixture.calls.some((call) => call.method !== "GET"),
      false,
    );
  },
);

Deno.test(
  "a missing skill still reports not found without writing",
  async () => {
    const fixture = executorClient([null]);
    assertEquals(
      await executeUpdateSkill(
        { skill_id: "missing", body: "test" },
        fixture.context,
      ),
      { error: "Skill not found" },
    );
    assertEquals(fixture.calls.length, 1);
  },
);
