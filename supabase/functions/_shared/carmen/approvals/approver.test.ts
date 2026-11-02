import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import {
  authorizeApprovalActor,
  claimApprovalRow,
  expireApprovalRow,
} from "./approver.ts";
import { fakeDb } from "./test-db.ts";

const T1 = "tenant-1";
const ROW = { id: "row-1", tenant_id: T1 };
const USER = "22222222-2222-4222-8222-222222222222";
const ok = (data: unknown) => ({ data, error: null });
const fail = { data: null, error: { message: "db down" } };

Deno.test("claimApprovalRow", async (t) => {
  await t.step(
    "claims only a live, undecided row of the row's tenant",
    async () => {
      const claimed = { ...ROW, status: "executing" };
      const { client, calls } = fakeDb({
        agent_approval_queue: [ok([claimed])],
      });
      assertStrictEquals(await claimApprovalRow(client, ROW, USER), claimed);
      const [update, ...filters] = calls;
      assertEquals(update[1], "update");
      assertEquals((update[2] as { status: string }).status, "executing");
      assertEquals((update[2] as { approved_by: string }).approved_by, USER);
      assertEquals(filters.slice(0, 3), [
        ["agent_approval_queue", "eq", "id", "row-1"],
        ["agent_approval_queue", "eq", "tenant_id", T1],
        ["agent_approval_queue", "in", "status", ["pending", "approved"]],
      ]);
      const [, orMethod, orFilter] = filters[3];
      assertEquals(orMethod, "or");
      assert(String(orFilter).startsWith("expires_at.is.null,expires_at.gt."));
    },
  );

  await t.step(
    "returns null when no row was updated (someone else won)",
    async () => {
      const { client } = fakeDb({ agent_approval_queue: [ok([])] });
      assertStrictEquals(await claimApprovalRow(client, ROW, USER), null);
    },
  );

  await t.step("run steps claim pending → decision", async () => {
    const { client, calls } = fakeDb({ agent_approval_queue: [ok([ROW])] });
    await claimApprovalRow(client, ROW, USER, {
      from: ["pending"],
      to: "approved",
    });
    assertEquals((calls[0][2] as { status: string }).status, "approved");
    assertEquals(calls[3], [
      "agent_approval_queue",
      "in",
      "status",
      ["pending"],
    ]);
  });

  await t.step("a query error throws", async () => {
    const { client } = fakeDb({ agent_approval_queue: [fail] });
    await assertRejects(() => claimApprovalRow(client, ROW, USER));
  });
});

Deno.test("expireApprovalRow", async (t) => {
  await t.step(
    "expires only an undecided row of the row's tenant",
    async () => {
      const { client, calls } = fakeDb({ agent_approval_queue: [ok(null)] });
      await expireApprovalRow(client, ROW);
      assertEquals(calls.slice(1), [
        ["agent_approval_queue", "eq", "id", "row-1"],
        ["agent_approval_queue", "eq", "tenant_id", T1],
        ["agent_approval_queue", "in", "status", ["pending", "approved"]],
      ]);
    },
  );

  await t.step("a query error throws", async () => {
    const { client } = fakeDb({ agent_approval_queue: [fail] });
    await assertRejects(() => expireApprovalRow(client, ROW));
  });
});

Deno.test("authorizeApprovalActor", async (t) => {
  const money = {
    tenant_id: T1,
    tool_name: "fb_update_budget",
    requested_by: USER,
  };
  const scope = (roles: unknown, members: unknown) =>
    fakeDb({ user_roles: [roles], tenant_users: [members] });

  await t.step("a user outside the row's tenant gets 404", async () => {
    const { client } = scope(ok([]), ok([]));
    assertEquals(await authorizeApprovalActor(client, money, USER, "execute"), {
      ok: false,
      status: 404,
      error: "approval_not_found",
    });
  });

  await t.step(
    "a campaigner of the tenant gets 403 approver_role_required",
    async () => {
      const { client, calls } = scope(
        ok([{ role: "campaigner", tenant_id: T1 }]),
        ok([]),
      );
      assertEquals(
        await authorizeApprovalActor(client, money, USER, "execute"),
        {
          ok: false,
          status: 403,
          error: "approver_role_required",
        },
      );
      assertEquals(calls[2], [
        "user_roles",
        "or",
        `tenant_id.eq.${T1},tenant_id.is.null`,
      ]);
    },
  );

  await t.step("an owner who is a tenant member may approve", async () => {
    const { client } = scope(
      ok([{ role: "owner", tenant_id: null }]),
      ok([{ id: "m1" }]),
    );
    assertEquals(await authorizeApprovalActor(client, money, USER, "execute"), {
      ok: true,
    });
  });

  await t.step("the requester may withdraw their own money row", async () => {
    const { client } = scope(
      ok([{ role: "campaigner", tenant_id: T1 }]),
      ok([]),
    );
    assertEquals(await authorizeApprovalActor(client, money, USER, "reject"), {
      ok: true,
    });
  });

  await t.step("no user: 403 approver_required without a query", async () => {
    const { client, calls } = scope(ok([]), ok([]));
    assertEquals(await authorizeApprovalActor(client, money, null, "execute"), {
      ok: false,
      status: 403,
      error: "approver_required",
    });
    assertEquals(calls, []);
  });

  await t.step(
    "a failed role or membership query throws instead of 404",
    async () => {
      await assertRejects(() =>
        authorizeApprovalActor(
          scope(fail, ok([])).client,
          money,
          USER,
          "execute",
        ),
      );
      await assertRejects(() =>
        authorizeApprovalActor(
          scope(ok([]), fail).client,
          money,
          USER,
          "execute",
        ),
      );
    },
  );
});
