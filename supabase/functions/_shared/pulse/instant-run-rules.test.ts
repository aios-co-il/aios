import { assertStrictEquals } from "jsr:@std/assert@1";
import { parsePulseInstantRunRules } from "./instant-run-rules.ts";

Deno.test("parsePulseInstantRunRules", async (t) => {
  await t.step(
    "max_exception_messages_per_run is clamped to 1..10, default 3",
    () => {
      const cap = (value: unknown) =>
        parsePulseInstantRunRules({ max_exception_messages_per_run: value })
          .max_exception_messages_per_run;
      assertStrictEquals(
        parsePulseInstantRunRules(null).max_exception_messages_per_run,
        3,
      );
      assertStrictEquals(cap(5), 5);
      assertStrictEquals(cap("6"), 6);
      assertStrictEquals(cap(0), 1);
      assertStrictEquals(cap(-4), 1);
      assertStrictEquals(cap(50), 10);
      assertStrictEquals(cap(2.9), 2);
      assertStrictEquals(cap("many"), 3);
      assertStrictEquals(cap(null), 3);
      assertStrictEquals(cap(true), 3);
    },
  );
});
