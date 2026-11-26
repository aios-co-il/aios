import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { DEVICE_STEPS_PER_MESSAGE } from "../../_shared/carmen/device/contract.ts";
import { RESULT_FIELD_MAX } from "../../_shared/carmen/device/results.ts";
import { browserTabContextMetadata } from "../../_shared/carmen/screen-context.ts";
import { continuationBody, continueOver } from "./continuation.test-fixture.ts";
import {
  ACTION,
  actionRow,
  doneRow,
  NOW,
  openOver,
  panelTurn,
  tablesWith,
} from "./turn.test-fixture.ts";

const BOTH = { device: { tools: ["browser_read_page", "browser_navigate"] } };

/** A turn whose panel announced the read and the navigation, beside `tab` when given. */
function navigatingTurn(tab?: string) {
  return panelTurn(
    {},
    tab
      ? {
          ...BOTH,
          context_metadata: browserTabContextMetadata(
            { url: tab, title: "Tab" },
            NOW.toISOString(),
          ),
        }
      : BOTH,
  );
}

/** The navigation's result and the rows after it. */
async function navigate(args: unknown, tab?: string, steps = tablesWith([])) {
  const { turn } = await openOver(steps, navigatingTurn(tab));
  const result = await turn.call("browser_navigate", args);

  return { turn, result, rows: steps.carmen_device_actions };
}

Deno.test(
  "a navigation writes one step with its checked destination",
  async (t) => {
    await t.step(
      "the row holds the destination as the parser writes it, and the turn pauses",
      async () => {
        const { turn, result, rows } = await navigate({
          url: "HTTPS://Shop.Example/a b?q=1",
        });

        assertStrictEquals(rows.length, 1);
        assertEquals(rows[0].tool, "browser_navigate");
        assertEquals(rows[0].arguments, {
          url: "https://shop.example/a%20b?q=1",
        });
        assertEquals(turn.pausedAt(result), {
          action_id: String(rows[0].id),
          tool: "browser_navigate",
        });
      },
    );

    await t.step("an http destination is an address too", async () => {
      const { rows } = await navigate({ url: "http://shop.example/" });

      assertEquals(rows[0].arguments, { url: "http://shop.example/" });
    });

    await t.step("not when the panel did not announce it", async () => {
      const steps = tablesWith([]);
      const { turn } = await openOver(steps, panelTurn());

      const result = await turn.call("browser_navigate", {
        url: "https://shop.example/",
      });

      assertEquals((result as { error: string }).error, "not_offered");
      assertStrictEquals(steps.carmen_device_actions.length, 0);
    });
  },
);

Deno.test("a destination out of reach writes no row", async (t) => {
  const outOfReach: Array<[string, string]> = [
    ["AIOS itself", "https://staging.aios.co.il/t/acme/command-center"],
    ["the production app", "https://aios.co.il/"],
    ["the backend", "https://abcdefghijklmnop.supabase.co/rest/v1/"],
    ["Google sign-in", "https://accounts.google.com/o/oauth2/auth"],
    ["the extension store", "https://chromewebstore.google.com/"],
    ["a bank on the act floor", "https://www.bankhapoalim.co.il/login"],
    ["mail on the act floor", "https://mail.google.com/mail/u/0/"],
    ["a trailing-dot spelling of a floor host", "https://wa.me./972500000000"],
  ];
  for (const [name, url] of outOfReach) {
    await t.step(name, async () => {
      const { turn, result, rows } = await navigate({ url });

      assertEquals((result as { error: string }).error, "never");
      assertStrictEquals(turn.pausedAt(result), null);
      assertStrictEquals(rows.length, 0);
    });
  }

  const notAnAddress: Array<[string, unknown]> = [
    ["javascript:", { url: "javascript:alert(1)" }],
    ["data:", { url: "data:text/html,<b>hi</b>" }],
    ["file:", { url: "file:///etc/passwd" }],
    ["chrome:", { url: "chrome://settings" }],
    ["credentials", { url: "https://aios.co.il@evil.example/" }],
    ["a password only", { url: "https://:pw@shop.example/" }],
    ["a relative address", { url: "/account" }],
    [
      "too long",
      { url: `https://shop.example/${"a".repeat(RESULT_FIELD_MAX)}` },
    ],
    ["no url", {}],
    ["an extra argument", { url: "https://shop.example/", tab: 3 }],
    ["a url that is not text", { url: ["https://shop.example/"] }],
  ];
  for (const [name, args] of notAnAddress) {
    await t.step(`not an address: ${name}`, async () => {
      const { result, rows } = await navigate(args);

      assertEquals((result as { error: string }).error, "invalid_arguments");
      assertStrictEquals(rows.length, 0);
    });
  }

  await t.step(
    "a tab on the act floor is not navigated away from",
    async () => {
      const { result, rows } = await navigate(
        { url: "https://shop.example/" },
        "https://mail.google.com/mail/u/0/",
      );

      assertEquals((result as { error: string }).error, "never");
      assertStrictEquals(rows.length, 0);
    },
  );

  await t.step("the message's steps are used up", async () => {
    const steps = tablesWith(
      Array.from({ length: DEVICE_STEPS_PER_MESSAGE }, (_, index) =>
        actionRow({ id: `step-${index}`, status: "done" }),
      ),
    );

    const { result } = await navigate(
      { url: "https://shop.example/" },
      undefined,
      steps,
    );

    assertEquals((result as { error: string }).error, "step_limit");
  });
});

/** A done navigation that landed on `origin` + `path`. */
function landedRow(origin: string, path: string) {
  return doneRow({
    tool: "browser_navigate",
    decision: "ask",
    observed_origin: origin,
    observed_path: path,
    result: { origin, path, title: "Landed" },
  });
}

Deno.test(
  "a navigation's outcome reaches the run as an address only",
  async (t) => {
    await t.step(
      "where it landed and its title, and an instruction to read before acting",
      async () => {
        const { turn } = await continueOver(
          [landedRow("https://shop.example", "/cart")],
          [],
          continuationBody(ACTION, BOTH),
        );

        const userTurn = turn.userTurn("(המשך)");

        assert(userTurn.includes("tool: browser_navigate"));
        assert(userTurn.includes("status: done"));
        assert(userTurn.includes("Call browser_read_page before"));
        assert(userTurn.includes("Landed"));
        assertStrictEquals(
          userTurn.includes("the page below is what it read"),
          false,
        );
      },
    );

    await t.step(
      "a report that it landed on the act floor is refused, and nothing of it is shown",
      async () => {
        const step = landedRow("https://www.leumi.co.il", "/accounts");
        const { turn } = await continueOver(
          [step],
          [],
          continuationBody(ACTION, BOTH),
        );

        const userTurn = turn.userTurn("(המשך)");

        assert(userTurn.includes("status: refused"));
        assertStrictEquals(userTurn.includes("leumi"), false);
        assertStrictEquals(userTurn.includes("Landed"), false);
        assertStrictEquals(step.status, "refused");
      },
    );

    await t.step("a read of a floor page is still shown", async () => {
      const { turn } = await continueOver(
        [
          doneRow({
            observed_origin: "https://www.leumi.co.il",
            observed_path: "/pricing",
            result: {
              origin: "https://www.leumi.co.il",
              path: "/pricing",
              snapshot_id: "s1",
              title: "Rates",
              elements: [],
              text: "Rates",
            },
          }),
        ],
        [],
        continuationBody(ACTION, BOTH),
      );

      assert(turn.userTurn("(המשך)").includes("status: done"));
    });
  },
);
