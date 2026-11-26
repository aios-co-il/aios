import { assertEquals } from "jsr:@std/assert@1";
import { handleDeviceAction, REQUEST_CHARS_MAX } from "./handler.ts";
import {
  ACTION,
  actionRow,
  answer,
  CLAIM,
  COLLEAGUE,
  DONE,
  NOT_AVAILABLE,
  OTHER_TENANT,
  post,
  SERVICE_TOKEN,
  world,
} from "./handler.test-fixture.ts";

// Row-level security answers the caller's read. These cases make that read show a row it
// should not, so the checks after it are the ones deciding.
Deno.test("the checks behind row-level security", async (t) => {
  const stored: Record<string, Record<string, unknown>> = {
    "another user's row": { user_id: COLLEAGUE },
    "a row that moved to another org": { tenant_id: OTHER_TENANT },
  };
  for (const [name, change] of Object.entries(stored)) {
    await t.step(`a claim leaves ${name} pending`, async () => {
      const { action, deps } = world(actionRow(change), {
        callerReads: actionRow(),
      });

      assertEquals(await answer(post(CLAIM), deps), {
        status: 404,
        body: NOT_AVAILABLE,
      });
      assertEquals(action.status, "pending");
    });

    await t.step(`a complete leaves ${name} claimed`, async () => {
      const { action, deps } = world(
        actionRow({ ...change, status: "claimed" }),
        { callerReads: actionRow({ status: "claimed" }) },
      );

      assertEquals(await answer(post(DONE), deps), {
        status: 404,
        body: NOT_AVAILABLE,
      });
      assertEquals([action.status, action.result], ["claimed", undefined]);
    });
  }

  await t.step(
    "a row of another user is refused even when the read shows it",
    async () => {
      const row = actionRow({ user_id: COLLEAGUE });
      const { action, deps } = world(row, { callerReads: row });

      assertEquals(await answer(post(CLAIM), deps), {
        status: 404,
        body: NOT_AVAILABLE,
      });
      assertEquals(action.status, "pending");
    },
  );
});

Deno.test("every request", async (t) => {
  await t.step(
    "a signed-out caller gets 401 before the body is read",
    async () => {
      const { action, deps } = world();

      for (const body of [CLAIM, "not json"]) {
        const refusal = await answer(post(body, "Bearer nobody"), deps);
        assertEquals(refusal, { status: 401, body: { error: "unauthorized" } });
      }
      assertEquals(action.status, "pending");
    },
  );

  await t.step("a malformed request is refused before any read", async () => {
    const { deps } = world();
    const bodies = [
      { action: "claim", id: ACTION.replaceAll("-", "") },
      { action: "claim", id: [ACTION] },
      { action: "release", id: ACTION },
      "not json",
    ];

    for (const body of bodies) {
      assertEquals(await answer(post(body), deps), {
        status: 400,
        body: { error: "invalid_request" },
      });
    }
  });

  await t.step("a body over the limit is refused, however valid", async () => {
    const { action, deps } = world();
    const atLimit = JSON.stringify({ ...CLAIM, padding: "" });
    const padding = "x".repeat(REQUEST_CHARS_MAX - atLimit.length + 1);

    const refusal = await answer(post({ ...CLAIM, padding }), deps);

    assertEquals(refusal, { status: 400, body: { error: "invalid_request" } });
    assertEquals(action.status, "pending");
    assertEquals(
      (await answer(post({ ...CLAIM, padding: padding.slice(1) }), deps))
        .status,
      200,
    );
  });

  await t.step("the service key is no user", async () => {
    const { action, deps } = world();

    assertEquals(await answer(post(CLAIM, SERVICE_TOKEN), deps), {
      status: 401,
      body: { error: "unauthorized" },
    });
    assertEquals(action.status, "pending");
  });

  await t.step("a failed read answers 500 and changes nothing", async () => {
    const { action, deps } = world(actionRow(), {
      failing: "carmen_device_actions",
    });

    assertEquals(await answer(post(CLAIM), deps), {
      status: 500,
      body: { error: "failed" },
    });
    assertEquals(action.status, "pending");
  });

  await t.step("only POST is served", async () => {
    const { deps } = world();
    const get = new Request("http://local/carmen-device-action");

    assertEquals((await handleDeviceAction(get, deps)).status, 405);
  });
});
