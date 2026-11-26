import { assertEquals } from "jsr:@std/assert@1";
import { actTarget } from "./act-target.ts";
import type { RunStep } from "./rows.ts";

const ORIGIN = "https://shop.example";
const TAB = `${ORIGIN}/form`;
const SNAPSHOT = { snapshot_id: "s1", refs: ["e1", "e2"] };

/** One step of a run, a done read of the form page unless `overrides` say otherwise. */
function step(overrides: Partial<RunStep> = {}): RunStep {
  return {
    id: crypto.randomUUID(),
    tool: "browser_read_page",
    status: "done",
    result: SNAPSHOT,
    observed_origin: ORIGIN,
    observed_path: "/form",
    ...overrides,
  };
}

Deno.test("actTarget", async (t) => {
  await t.step("the latest done read of the tab's page", () => {
    const older = step({ result: { snapshot_id: "s0", refs: ["e1"] } });

    assertEquals(actTarget([older, step()], TAB), {
      refusal: null,
      snapshotId: "s1",
      refs: ["e1", "e2"],
    });
  });

  await t.step("a read that did not run is skipped", () => {
    assertEquals(
      actTarget([step(), step({ status: "denied", result: null })], TAB)
        .refusal,
      null,
    );
  });

  const refusals: Array<[string, Array<RunStep>, string, string]> = [
    ["no read at all", [], TAB, "no_snapshot"],
    [
      "a read that kept no snapshot",
      [step({ result: null })],
      TAB,
      "no_snapshot",
    ],
    [
      "a malformed kept snapshot",
      [step({ result: { snapshot_id: "s1", refs: [1] } })],
      TAB,
      "no_snapshot",
    ],
    ["another path", [step()], `${ORIGIN}/other`, "page_changed"],
    ["another origin", [step()], "https://evil.example/form", "page_changed"],
    ["an address that is not one", [step()], "not a url", "page_changed"],
    [
      "a move after the read",
      [step(), step({ tool: "browser_navigate", result: null })],
      TAB,
      "page_changed",
    ],
    [
      "a move refused after it may have run",
      [step(), step({ tool: "browser_navigate", status: "refused" })],
      TAB,
      "page_changed",
    ],
    [
      "a click that changed the page",
      [step(), step({ tool: "browser_click", result: { changed: true } })],
      TAB,
      "page_changed",
    ],
    [
      "a type whose outcome is unknown",
      [step(), step({ tool: "browser_type", status: "outcome_unknown" })],
      TAB,
      "page_changed",
    ],
    [
      "a click still open",
      [step(), step({ tool: "browser_click", status: "claimed" })],
      TAB,
      "page_changed",
    ],
    [
      "another site read before, with no move since",
      [step({ observed_origin: "https://evil.example" }), step()],
      TAB,
      "tainted",
    ],
  ];
  for (const [name, steps, tab, refusal] of refusals) {
    await t.step(`refused: ${name}`, () => {
      assertEquals(actTarget(steps, tab).refusal, refusal);
    });
  }

  await t.step(
    "a click that left the page as it was keeps the read's refs",
    () => {
      const click = step({ tool: "browser_click", result: { changed: false } });

      assertEquals(actTarget([step(), click], TAB).refusal, null);
    },
  );

  await t.step("a move the user approved lifts the taint before it", () => {
    const steps = [
      step({ observed_origin: "https://evil.example" }),
      step({ tool: "browser_navigate", result: null }),
      step(),
    ];

    assertEquals(actTarget(steps, TAB).refusal, null);
  });
});
