import { assertEquals } from "jsr:@std/assert@1";
import {
  READ_PAGE_ELEMENTS_MAX,
  READ_PAGE_TEXT_MAX,
} from "../_shared/carmen/device/results.ts";
import {
  ACTION,
  actionRow,
  answer,
  CLAIM,
  COLLEAGUE,
  DONE,
  ME,
  NOT_AVAILABLE,
  NOW,
  PAGE,
  post,
  RUN,
  SNAPSHOT,
  world,
} from "./handler.test-fixture.ts";

Deno.test("claim", async (t) => {
  await t.step("hands the tool and arguments to its user, once", async () => {
    const { action, deps } = world(
      actionRow({ tool: "browser_click", arguments: { ref: "e1" } }),
    );

    assertEquals(await answer(post(CLAIM), deps), {
      status: 200,
      body: { tool: "browser_click", arguments: { ref: "e1" } },
    });
    assertEquals(action.status, "claimed");
    assertEquals(action.claimed_at, NOW.toISOString());

    assertEquals(await answer(post(CLAIM), deps), {
      status: 404,
      body: NOT_AVAILABLE,
    });
  });

  await t.step("refuses another user and leaves the row pending", async () => {
    const { action, deps } = world();

    const refusal = await answer(post(CLAIM, "Bearer colleague"), deps);

    assertEquals(refusal, { status: 404, body: NOT_AVAILABLE });
    assertEquals(action.status, "pending");
  });

  await t.step("refuses an expired action", async () => {
    const { action, deps } = world(
      actionRow({ expires_at: NOW.toISOString() }),
    );

    assertEquals((await answer(post(CLAIM), deps)).body, NOT_AVAILABLE);
    assertEquals(action.status, "pending");
  });

  await t.step("refuses a stopped run and closes the action", async () => {
    const { action, deps } = world(actionRow(), {
      stops: [{ run_id: RUN, user_id: ME }],
    });

    assertEquals(await answer(post(CLAIM), deps), {
      status: 404,
      body: NOT_AVAILABLE,
    });
    assertEquals(action.status, "cancelled");
    assertEquals((await answer(post(CLAIM), deps)).status, 404);
  });

  await t.step("a stop by someone else does not block it", async () => {
    const { deps } = world(actionRow(), {
      stops: [{ run_id: RUN, user_id: COLLEAGUE }],
    });

    assertEquals((await answer(post(CLAIM), deps)).status, 200);
  });

  await t.step(
    "hands nothing over when the stop cannot be read, and the action cannot be claimed again",
    async () => {
      const { action, deps } = world(
        actionRow({ tool: "browser_type", arguments: { text: "secret" } }),
        { failing: "carmen_run_cancellations" },
      );

      assertEquals(await answer(post(CLAIM), deps), {
        status: 500,
        body: { error: "failed" },
      });
      assertEquals(action.status, "claimed");
      assertEquals((await answer(post(CLAIM), deps)).status, 404);
    },
  );

  await t.step("refuses a row whose tool is not a device tool", async () => {
    const { action, deps } = world(actionRow({ tool: "send_whatsapp" }));

    assertEquals((await answer(post(CLAIM), deps)).body, NOT_AVAILABLE);
    assertEquals(action.status, "pending");
  });
});

Deno.test("complete", async (t) => {
  await t.step("stores what the claiming user reports, once", async () => {
    const { action, deps } = world(actionRow({ status: "claimed" }));

    assertEquals(await answer(post(DONE), deps), {
      status: 200,
      body: { ok: true },
    });
    assertEquals(
      {
        status: action.status,
        decision: action.decision,
        origin: action.observed_origin,
        path: action.observed_path,
        result: action.result,
        completed_at: action.completed_at,
      },
      {
        status: "done",
        decision: "free",
        origin: PAGE.origin,
        path: PAGE.path,
        result: SNAPSHOT,
        completed_at: NOW.toISOString(),
      },
    );

    const denied = { action: "complete", id: ACTION, status: "denied" };
    assertEquals(await answer(post({ ...denied, decision: "ask" }), deps), {
      status: 404,
      body: NOT_AVAILABLE,
    });
    assertEquals(action.status, "done");
  });

  await t.step(
    "keeps no typed text once a typing step is closed, and a click's arguments as they were",
    async () => {
      const typed = { snapshot_id: "s1", ref: "e1", text: "secret words" };
      const typing = world(
        actionRow({
          status: "claimed",
          tool: "browser_type",
          arguments: typed,
        }),
      );
      const clicking = world(
        actionRow({
          status: "claimed",
          tool: "browser_click",
          arguments: { snapshot_id: "s1", ref: "e1" },
        }),
      );
      const denied = { action: "complete", id: ACTION, status: "denied" };
      const report = { ...denied, decision: "ask", observed: PAGE };

      await answer(post(report), typing.deps);
      await answer(post(report), clicking.deps);

      assertEquals(typing.action.status, "denied");
      assertEquals(typing.action.arguments, {});
      assertEquals(clicking.action.arguments, { snapshot_id: "s1", ref: "e1" });
    },
  );

  await t.step("refuses another user", async () => {
    const { action, deps } = world(actionRow({ status: "claimed" }));

    const refusal = await answer(post(DONE, "Bearer colleague"), deps);

    assertEquals(refusal, { status: 404, body: NOT_AVAILABLE });
    assertEquals(action.status, "claimed");
  });

  await t.step("refuses an action nobody claimed", async () => {
    const { action, deps } = world();

    assertEquals((await answer(post(DONE), deps)).body, NOT_AVAILABLE);
    assertEquals(action.status, "pending");
    assertEquals(action.result, undefined);
  });

  await t.step("stores a refusal without a result", async () => {
    const { action, deps } = world(actionRow({ status: "claimed" }));
    const report = { action: "complete", id: ACTION, status: "refused" };

    assertEquals(
      (await answer(post({ ...report, decision: "never" }), deps)).status,
      200,
    );
    assertEquals(
      [action.status, action.decision, action.result],
      ["refused", "never", null],
    );
  });

  const element = { ref: "e", role: "link", name: "n" };
  const unfit: Record<string, unknown> = {
    "too many elements": {
      ...SNAPSHOT,
      elements: Array(READ_PAGE_ELEMENTS_MAX + 1).fill(element),
    },
    "too much text": { ...SNAPSHOT, text: "x".repeat(READ_PAGE_TEXT_MAX + 1) },
    "a missing field": PAGE,
    "an extra field": { ...SNAPSHOT, value: "typed text" },
    "text cut through an emoji": { ...SNAPSHOT, text: "price \ud83d" },
  };
  for (const [name, result] of Object.entries(unfit)) {
    await t.step(`refuses a result with ${name}`, async () => {
      const { action, deps } = world(actionRow({ status: "claimed" }));

      assertEquals(await answer(post({ ...DONE, result }), deps), {
        status: 400,
        body: { error: "invalid_result" },
      });
      assertEquals([action.status, action.result], ["claimed", undefined]);
    });
  }

  for (const status of ["pending", "claimed", "outcome_unknown", "approved"]) {
    await t.step(`refuses the status ${status} from a panel`, async () => {
      const { action, deps } = world(actionRow({ status: "claimed" }));

      assertEquals(await answer(post({ ...DONE, status }), deps), {
        status: 400,
        body: { error: "invalid_request" },
      });
      assertEquals(action.status, "claimed");
    });
  }
});
