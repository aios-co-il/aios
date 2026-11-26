import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { withTurnPictures } from "../attachments/picture-turn.ts";
import { continuationBody } from "./continuation.test-fixture.ts";
import {
  bucketOf,
  MAIL,
  MAIL_CONTEXT,
  SHOT_PATH,
  shotRow,
} from "./screenshot.test-fixture.ts";
import {
  ACTION,
  capturing,
  COLLEAGUE,
  CONVERSATION,
  openOver,
  panelTurn,
  RUN,
  TENANT,
  tablesWith,
} from "./turn.test-fixture.ts";

const SCREENSHOT_TOOLS = { device: { tools: ["browser_screenshot"] } };

/** Opens a turn over these steps and stops with the bucket and the permission as given. */
function openWith(
  steps: Array<Record<string, unknown>>,
  options: {
    body?: Record<string, unknown>;
    allowed?: boolean;
    stops?: Array<Record<string, unknown>>;
    context?: unknown;
  } = {},
) {
  const bucket = bucketOf();
  const tables = tablesWith(steps, options.stops);
  const input = panelTurn(
    {
      screenshotStore: bucket.store,
      sensitiveScreenshotsAllowed: () =>
        Promise.resolve(options.allowed === true),
    },
    {
      ...SCREENSHOT_TOOLS,
      ...(options.context ? { context_metadata: options.context } : {}),
      ...(options.body ?? {}),
    },
  );
  return openOver(tables, input).then((opened) => ({
    ...opened,
    bucket,
    tables,
  }));
}

Deno.test(
  "a screenshot step is written only where the server allows it",
  async (t) => {
    await t.step("an ordinary page: offered and written", async () => {
      const { turn, tables } = await openWith([]);

      const result = await turn.call("browser_screenshot", {});

      assert(
        turn.offeredTools.some((tool) => tool.name === "browser_screenshot"),
      );
      assert("device_action" in result);
      assertEquals(tables.carmen_device_actions.length, 1);
    });

    await t.step(
      "the act floor without the permission: refused, no row",
      async () => {
        const { turn, tables } = await openWith([], { context: MAIL_CONTEXT });

        const result = await turn.call("browser_screenshot", {});

        assertEquals("error" in result && result.error, "never");
        assertEquals(tables.carmen_device_actions, []);
      },
    );

    await t.step("the act floor with the permission: written", async () => {
      const { turn, tables } = await openWith([], {
        context: MAIL_CONTEXT,
        allowed: true,
      });

      const result = await turn.call("browser_screenshot", {});

      assert("device_action" in result);
      assertEquals(tables.carmen_device_actions.length, 1);
    });

    await t.step("arguments of any kind are refused", async () => {
      const { turn, tables } = await openWith([]);

      const result = await turn.call("browser_screenshot", { url: "x" });

      assertEquals("error" in result && result.error, "invalid_arguments");
      assertEquals(tables.carmen_device_actions, []);
    });
  },
);

Deno.test(
  "a resumed screenshot reaches the brain as a picture, once",
  async (t) => {
    await t.step(
      "the picture is read inline, the file deleted, the row cleared",
      async () => {
        const step = shotRow();
        const { turn, bucket } = await openWith([step], {
          body: continuationBody(ACTION),
        });

        const [picture] = turn.pictures.pictures;
        const userTurn = turn.userTurn("(המשך)");

        assert(picture.dataUrl?.startsWith("data:image/png;base64,"));
        assertEquals(bucket.read, [SHOT_PATH]);
        assertEquals(bucket.removed, [SHOT_PATH]);
        assertStrictEquals(step.result, null);
        assert(step.consumed_at);
        assert(userTurn.includes("status: done"));
        assert(userTurn.includes("browser_screenshot"));
        // Neither the file nor its folder reaches the model or the saved history.
        assertStrictEquals(userTurn.includes(SHOT_PATH), false);
        assertStrictEquals(userTurn.includes("storage_path"), false);
        assertStrictEquals(picture.name.includes(SHOT_PATH), false);
      },
    );

    await t.step(
      "a brain that sees gets the picture; one that cannot gets the plain line",
      async () => {
        const { turn } = await openWith([shotRow()], {
          body: continuationBody(ACTION),
        });
        const messages = [{ role: "user", content: "(המשך)" }];
        const at = { at: 0, text: "(המשך)" };

        const [seen] = withTurnPictures(messages, at, turn.pictures, {
          label: "google/gemini-3-flash-preview",
        });
        const [blind] = withTurnPictures(messages, at, turn.pictures, {
          label: "brain:openrouter/x",
          connectionId: "c1",
        });

        assert(Array.isArray(seen.content));
        assertEquals(seen.content[1].type, "image_url");
        assertEquals(typeof blind.content, "string");
        assert(String(blind.content).includes("cannot read pictures"));
        assertStrictEquals(String(blind.content).includes("base64"), false);
      },
    );

    await t.step(
      "a picture of the act floor without the permission now is withheld and deleted",
      async () => {
        const step = shotRow(MAIL);
        const { turn, bucket } = await openWith([step], {
          body: continuationBody(ACTION),
          context: MAIL_CONTEXT,
        });

        assertEquals(turn.pictures.pictures, []);
        assertEquals(bucket.read, []);
        assertEquals(bucket.removed, [SHOT_PATH]);
        assert(turn.userTurn("").includes("status: refused"));
        assertStrictEquals(step.status, "refused");
      },
    );

    await t.step(
      "a picture of the act floor with the permission reaches the brain",
      async () => {
        const { turn, bucket } = await openWith([shotRow(MAIL)], {
          body: continuationBody(ACTION),
          context: MAIL_CONTEXT,
          allowed: true,
        });

        assertEquals(turn.pictures.pictures.length, 1);
        assertEquals(bucket.removed, [SHOT_PATH]);
      },
    );

    await t.step(
      "a file outside my own folder is never read or deleted",
      async () => {
        const { turn, bucket } = await openWith(
          [shotRow(undefined, `${COLLEAGUE}/their.jpg`)],
          { body: continuationBody(ACTION) },
        );

        assertEquals(turn.pictures.pictures, []);
        assertEquals(bucket.read, []);
        assertEquals(bucket.removed, []);
      },
    );

    await t.step(
      "a file that cannot be read becomes the refusal line, and is still deleted",
      async () => {
        const step = shotRow(undefined, `${shotRow().user_id}/missing.jpg`);
        const { turn, bucket } = await openWith([step], {
          body: continuationBody(ACTION),
        });

        assertEquals(turn.pictures.pictures, []);
        assertEquals(turn.pictures.refused.length, 1);
        assertEquals(bucket.removed.length, 1);
      },
    );

    await t.step(
      "a stopped run deletes the file and shows nothing",
      async () => {
        const { turn, bucket } = await openWith([shotRow()], {
          body: continuationBody(ACTION),
          stops: [
            { run_id: RUN, user_id: shotRow().user_id, tenant_id: TENANT },
          ],
        });

        assert(turn.reply);
        assertEquals(bucket.read, []);
        assertEquals(bucket.removed, [SHOT_PATH]);
      },
    );
  },
);

Deno.test(
  "a screenshot nobody resumed is deleted by the next typed message",
  async (t) => {
    await t.step("its file goes before its row loses the path", async () => {
      const unused = shotRow(undefined, SHOT_PATH, { consumed_at: null });
      const { bucket } = await openWith([unused]);

      assertEquals(bucket.removed, [SHOT_PATH]);
      assertStrictEquals(unused.result, null);
    });

    await t.step("another conversation's picture is left alone", async () => {
      const elsewhere = shotRow(undefined, SHOT_PATH, {
        conversation_id: crypto.randomUUID(),
      });
      const { bucket } = await openWith([elsewhere]);

      assertEquals(bucket.removed, []);
      assertEquals(elsewhere.conversation_id === CONVERSATION, false);
    });

    await t.step(
      "a failed delete is logged without the path and the turn goes on",
      async () => {
        const errors = await capturing("error", async () => {
          const bucket = bucketOf();
          bucket.store.remove = () => Promise.reject(new Error("boom"));
          await openOver(
            tablesWith([shotRow(undefined, SHOT_PATH, { consumed_at: null })]),
            panelTurn({ screenshotStore: bucket.store }),
          );
        });

        assertEquals(errors.length, 1);
        assertStrictEquals(errors[0].includes(SHOT_PATH), false);
      },
    );
  },
);
