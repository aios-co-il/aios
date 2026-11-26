import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { DEVICE_TYPE_TEXT_MAX } from "../../_shared/carmen/device/contract.ts";
import { browserTabContextMetadata } from "../../_shared/carmen/screen-context.ts";
import {
  ALL_TOOLS,
  continuationBody,
  continueOver,
  stepAt,
} from "./continuation.test-fixture.ts";
import {
  ACTION,
  doneRow,
  NOW,
  openOver,
  PAGE,
  panelTurn,
  tablesWith,
} from "./turn.test-fixture.ts";

const TAB = `${PAGE.origin}${PAGE.path}`;
const CLICK = { snapshot_id: "s1", ref: "e1" };

/** A continuation that resumes the read of `example.com/pricing` (ACTION), after `earlier` steps, beside `tab`. */
async function afterTheRead(
  earlier: Array<Record<string, unknown>> = [],
  tab = TAB,
) {
  const read = doneRow({ created_at: "2026-11-26T10:30:00.000Z" });
  const body = continuationBody(ACTION, {
    ...ALL_TOOLS,
    context_metadata: browserTabContextMetadata(
      { url: tab, title: "Pricing" },
      NOW.toISOString(),
    ),
  });
  const opened = await continueOver([...earlier, read], [], body);

  return { ...opened, rows: opened.tables.carmen_device_actions };
}

/** The offered tool names of a turn. */
function offeredNames(turn: { offeredTools: Array<{ name: string }> }) {
  return turn.offeredTools.map((tool) => tool.name);
}

Deno.test(
  "click and type are offered only beside a read they can name",
  async (t) => {
    await t.step(
      "after a read of the tab's page: both, beside the others",
      async () => {
        const { turn } = await afterTheRead();

        assertEquals(offeredNames(turn), [
          "browser_read_page",
          "browser_navigate",
          "browser_click",
          "browser_type",
        ]);
      },
    );

    await t.step("a typed message holds no read, so neither", async () => {
      const { turn } = await openOver(tablesWith([]), panelTurn({}, ALL_TOOLS));

      assertEquals(offeredNames(turn), [
        "browser_read_page",
        "browser_navigate",
      ]);
    });

    await t.step(
      "the tab moved to another page since the read: neither",
      async () => {
        const { turn } = await afterTheRead([], `${PAGE.origin}/checkout`);

        assertEquals(offeredNames(turn), [
          "browser_read_page",
          "browser_navigate",
        ]);
      },
    );

    await t.step(
      "the run read another site before: neither (taint)",
      async () => {
        const other = stepAt(10, {
          observed_origin: "https://evil.example",
          observed_path: "/",
          result: { snapshot_id: "s0", refs: ["e1"] },
        });
        const { turn } = await afterTheRead([other]);

        assertEquals(offeredNames(turn), [
          "browser_read_page",
          "browser_navigate",
        ]);
      },
    );

    await t.step(
      "a move the user approved since that read lifts it",
      async () => {
        const other = stepAt(10, {
          observed_origin: "https://evil.example",
          observed_path: "/",
        });
        const moved = stepAt(20, {
          tool: "browser_navigate",
          observed_origin: PAGE.origin,
          observed_path: PAGE.path,
        });
        const { turn } = await afterTheRead([other, moved]);

        assert(offeredNames(turn).includes("browser_click"));
      },
    );
  },
);

Deno.test(
  "a click or type names an element of the run's latest read",
  async (t) => {
    await t.step(
      "a click on a ref of that read writes one step with its arguments",
      async () => {
        const { turn, rows } = await afterTheRead();

        const result = await turn.call("browser_click", CLICK);

        const written = rows.filter((row) => row.status === "pending");
        assertStrictEquals(written.length, 1);
        assertEquals(written[0].arguments, CLICK);
        assertEquals(turn.pausedAt(result)?.tool, "browser_click");
      },
    );

    await t.step("typing stores the text for the claim alone", async () => {
      const { turn, rows } = await afterTheRead();

      await turn.call("browser_type", { ...CLICK, text: "שלום\nworld" });

      const written = rows.find((row) => row.status === "pending");
      assertEquals(written?.arguments, { ...CLICK, text: "שלום\nworld" });
    });

    const refusals: Array<[string, Record<string, string>, string]> = [
      [
        "a ref the read never listed",
        { snapshot_id: "s1", ref: "e9" },
        "unknown_ref",
      ],
      [
        "another snapshot's id",
        { snapshot_id: "s0", ref: "e1" },
        "stale_snapshot",
      ],
      ["a forged extra argument", { ...CLICK, x: "1" }, "invalid_arguments"],
    ];
    for (const [name, args, reason] of refusals) {
      await t.step(`refused, no row: ${name}`, async () => {
        const { turn, rows } = await afterTheRead();

        const result = await turn.call("browser_click", args);

        assertEquals((result as { error: string }).error, reason);
        assertStrictEquals(turn.pausedAt(result), null);
        assertStrictEquals(
          rows.filter((row) => row.status === "pending").length,
          0,
        );
      });
    }

    for (const text of [
      "",
      "x".repeat(DEVICE_TYPE_TEXT_MAX + 1),
      "a\u0000b",
      "a‮b",
    ]) {
      await t.step(
        `typing refuses text ${JSON.stringify(
          text.slice(0, 8),
        )}… (${text.length})`,
        async () => {
          const { turn, rows } = await afterTheRead();

          const result = await turn.call("browser_type", { ...CLICK, text });

          assertEquals((result as { error: string }).error, "invalid_text");
          assertStrictEquals(
            rows.filter((row) => row.status === "pending").length,
            0,
          );
        },
      );
    }

    await t.step("typing takes text at its limit", async () => {
      const { turn } = await afterTheRead();

      const result = await turn.call("browser_type", {
        ...CLICK,
        text: "x".repeat(DEVICE_TYPE_TEXT_MAX),
      });

      assert("device_action" in result);
    });
  },
);
