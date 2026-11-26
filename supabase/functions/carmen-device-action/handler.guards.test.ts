import { assertEquals } from "jsr:@std/assert@1";
import { handleDeviceAction, REQUEST_CHARS_MAX } from "./handler.ts";
import {
  ACTION,
  actionRow,
  answer,
  CLAIM,
  COLLEAGUE,
  DONE,
  ME,
  NOT_AVAILABLE,
  OTHER_TENANT,
  post,
  SERVICE_TOKEN,
  TENANT,
  world,
} from "./handler.test-fixture.ts";

// Who may take a row: its own user, while they may act in its org. The org the panel's
// session has active (`user_active_tenant`) plays no part, so a super admin acting in an
// org they do not belong to claims their own step there.
Deno.test("who may take a row", async (t) => {
  await t.step(
    "a super admin claims and completes their own step in an org they do not belong to",
    async () => {
      const { action, deps } = world(actionRow({ tenant_id: OTHER_TENANT }), {
        superAdmins: [ME],
      });

      assertEquals((await answer(post(CLAIM), deps)).status, 200);
      assertEquals(action.status, "claimed");
      assertEquals(await answer(post(DONE), deps), {
        status: 200,
        body: { ok: true },
      });
      assertEquals(action.status, "done");
    },
  );

  await t.step(
    "a member of several orgs claims their step in any of them",
    async () => {
      const { action, deps } = world(actionRow({ tenant_id: OTHER_TENANT }), {
        members: [
          { tenant_id: TENANT, user_id: ME },
          { tenant_id: OTHER_TENANT, user_id: ME },
        ],
      });

      assertEquals((await answer(post(CLAIM), deps)).status, 200);
      assertEquals(action.status, "claimed");
    },
  );

  const refusedCases: Record<
    string,
    {
      row: Record<string, unknown>;
      token?: string;
      superAdmins?: Array<string>;
    }
  > = {
    "another user's row": { row: { user_id: COLLEAGUE } },
    "another user's row, for a super admin": {
      row: { user_id: COLLEAGUE },
      superAdmins: [ME],
    },
    "my row in an org I left": { row: { tenant_id: OTHER_TENANT } },
    "my row, asked for by my colleague": {
      row: {},
      token: "Bearer colleague",
    },
  };
  for (const [name, { row, token, superAdmins }] of Object.entries(
    refusedCases,
  )) {
    await t.step(`a claim leaves ${name} pending`, async () => {
      const { action, deps } = world(actionRow(row), { superAdmins });

      assertEquals(await answer(post(CLAIM, token), deps), {
        status: 404,
        body: NOT_AVAILABLE,
      });
      assertEquals(action.status, "pending");
    });

    await t.step(`a complete leaves ${name} claimed`, async () => {
      const { action, deps } = world(actionRow({ ...row, status: "claimed" }), {
        superAdmins,
      });

      assertEquals(await answer(post(DONE, token), deps), {
        status: 404,
        body: NOT_AVAILABLE,
      });
      assertEquals([action.status, action.result], ["claimed", undefined]);
    });
  }

  await t.step(
    "a failed access read answers 500 and changes nothing",
    async () => {
      for (const failing of ["tenant_users", "super_admins"]) {
        const { action, deps } = world(actionRow(), { failing });

        assertEquals(await answer(post(CLAIM), deps), {
          status: 500,
          body: { error: "failed" },
        });
        assertEquals(action.status, "pending");
      }
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
