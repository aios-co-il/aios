import { assertEquals } from "jsr:@std/assert@1";
import { withConsoleErrors } from "../../_shared/testing/console-errors.ts";
import { reportDropped, unexpectedDrops } from "./dropped.ts";
import type { UpsertOutcome } from "./types.ts";

/** An upsert outcome for fingerprint `fp`. */
const outcome = (
  fp: string,
  result: UpsertOutcome["outcome"],
): UpsertOutcome => ({
  finding_id: null,
  kind: "no_contact",
  fingerprint: fp,
  short_code: null,
  outcome: result,
});

Deno.test("reportDropped", async (t) => {
  await t.step("counts every candidate not stored, by outcome", async () => {
    const { result } = await withConsoleErrors(() =>
      Promise.resolve(
        reportDropped({ tenantId: "t", collector: "c" }, [
          outcome("a", "inserted"),
          outcome("b", "seen"),
          outcome("c", "duplicate"),
          outcome("d", "duplicate"),
          outcome("e", "suppressed"),
        ]),
      ),
    );
    assertEquals(result, { duplicate: 2, suppressed: 1 });
    assertEquals(unexpectedDrops(result), 2);
  });

  await t.step(
    "logs no line when only dismissed findings were skipped",
    async () => {
      const { logged } = await withConsoleErrors(() =>
        Promise.resolve(
          reportDropped({ tenantId: "t", collector: "c" }, [
            outcome("e", "suppressed"),
          ]),
        ),
      );
      assertEquals(logged, "");
    },
  );
});
