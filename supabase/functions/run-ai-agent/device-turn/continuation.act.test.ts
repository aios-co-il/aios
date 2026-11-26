import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import {
  ALL_TOOLS,
  continuationBody,
  continueOver,
  stepAt,
} from "./continuation.test-fixture.ts";
import { ACTION, doneRow, PAGE } from "./turn.test-fixture.ts";

const CLICK = { snapshot_id: "s1", ref: "e1" };

Deno.test(
  "a step after the read decides whether its refs still name anything",
  async (t) => {
    /** A click call over a read (minute 10), then `after` (minute 20), resumed from a last read-free step. */
    async function clickAfter(after: Record<string, unknown>) {
      const read = stepAt(10, {
        observed_origin: PAGE.origin,
        observed_path: PAGE.path,
        result: { snapshot_id: "s1", refs: ["e1"] },
      });
      const later = stepAt(20, after);
      const resumed = doneRow({
        tool: "browser_click",
        created_at: "2026-11-26T10:30:00.000Z",
        result: { ...PAGE, title: "Pricing", changed: false },
      });
      const body = continuationBody(ACTION, ALL_TOOLS);
      const { turn } = await continueOver([read, later, resumed], [], body);

      return turn.call("browser_click", CLICK);
    }

    await t.step(
      "a click that left the page as it was keeps them",
      async () => {
        const result = await clickAfter({
          tool: "browser_type",
          result: { changed: false },
        });

        assert("device_action" in result);
      },
    );

    const stale: Array<[string, Record<string, unknown>]> = [
      [
        "a click that changed the page",
        {
          tool: "browser_click",
          result: { changed: true },
        },
      ],
      [
        "a click whose outcome is unknown",
        {
          tool: "browser_click",
          status: "outcome_unknown",
        },
      ],
      ["a move the user approved", { tool: "browser_navigate" }],
    ];
    for (const [name, after] of stale) {
      await t.step(`${name} makes them stale: not even offered`, async () => {
        const result = await clickAfter(after);

        assertEquals((result as { error: string }).error, "not_offered");
      });
    }

    await t.step("a declined click changed nothing", async () => {
      const result = await clickAfter({
        tool: "browser_click",
        status: "denied",
      });

      assert("device_action" in result);
    });
  },
);

Deno.test(
  "a done click reaches the model as an address, never page text",
  async (t) => {
    await t.step(
      "the block says what changed and asks for a read",
      async () => {
        const click = doneRow({
          tool: "browser_click",
          result: { ...PAGE, title: "Pricing", changed: true },
        });
        const { turn } = await continueOver(
          [click],
          [],
          continuationBody(ACTION, ALL_TOOLS),
        );

        const userTurn = turn.userTurn("q");

        assert(userTurn.includes('"changed":true'));
        assert(userTurn.includes("Call browser_read_page before"));
        assertEquals(click.result, { changed: true });
      },
    );

    await t.step("a used typing step keeps no typed text", async () => {
      const typing = doneRow({
        tool: "browser_type",
        arguments: { ...CLICK, text: "secret words" },
        result: { ...PAGE, title: "Pricing", changed: false },
      });

      await continueOver([typing], [], continuationBody(ACTION, ALL_TOOLS));

      assertEquals(typing.arguments, {});
      assertEquals(typing.result, { changed: false });
    });

    await t.step(
      "a click that landed on the act floor is not believed",
      async () => {
        const bank = { origin: "https://www.leumi.co.il", path: "/accounts" };
        const click = doneRow({
          tool: "browser_click",
          observed_origin: bank.origin,
          observed_path: bank.path,
          result: { ...bank, title: "Leumi", changed: true },
        });
        const { turn } = await continueOver(
          [click],
          [],
          continuationBody(ACTION, ALL_TOOLS),
        );

        const userTurn = turn.userTurn("q");

        assertStrictEquals(userTurn.includes("Leumi"), false);
        assertStrictEquals(click.status, "refused");
      },
    );
  },
);
