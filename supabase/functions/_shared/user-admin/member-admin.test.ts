import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  authorizeMemberChange,
  MemberAdminError,
  type MemberRequest,
} from "./member-admin.ts";
import { memberAdminHandler } from "./member-admin-http.ts";
import {
  ADMIN,
  fakeStore,
  MEMBER,
  OTHER_OWNER,
  OWNER,
  TENANT_A,
  TENANT_B,
  world,
} from "./member-admin-fake.ts";

const asOwner = "Bearer owner-token";
const memberOfA: MemberRequest = { userId: MEMBER, tenantId: TENANT_A };

/** Asserts the check refuses with `status`, before any write. */
async function refuses(
  status: number,
  authorization: string | null,
  body: MemberRequest,
  edit: (w: ReturnType<typeof world>) => void = () => {},
) {
  const w = world();
  edit(w);
  const { store, writes } = fakeStore(w);
  const error = await assertRejects(
    () => authorizeMemberChange(store, authorization, body),
    MemberAdminError,
  );
  assertEquals(error.status, status);
  assertEquals(writes, []);
}

Deno.test("authorizeMemberChange", async (t) => {
  await t.step(
    "the owner may change another member of its tenant",
    async () => {
      const { store } = fakeStore(world());
      const target = await authorizeMemberChange(store, asOwner, memberOfA);
      assertEquals(target, {
        callerId: OWNER,
        tenantId: TENANT_A,
        targetId: MEMBER,
        membership: "active",
      });
    },
  );

  await t.step("a super admin acting in the tenant may", async () => {
    const { store } = fakeStore(world());
    const target = await authorizeMemberChange(
      store,
      "Bearer admin-token",
      memberOfA,
    );
    assertEquals(target.callerId, ADMIN);
  });

  await t.step("an email names the target", async () => {
    const { store } = fakeStore(world());
    const target = await authorizeMemberChange(store, asOwner, {
      email: " Member@Example.invalid ",
      tenantId: TENANT_A,
    });
    assertEquals(target.targetId, MEMBER);
  });

  await t.step("no or an unknown token is 401", async () => {
    await refuses(401, null, memberOfA);
    await refuses(401, "Bearer nobody", memberOfA);
  });

  await t.step("a missing tenant or target is 400", async () => {
    await refuses(400, asOwner, { userId: MEMBER });
    await refuses(400, asOwner, { tenantId: TENANT_A });
  });

  await t.step("an unknown email is 404", async () => {
    await refuses(404, asOwner, {
      email: "nobody@example.invalid",
      tenantId: TENANT_A,
    });
  });

  await t.step("the caller themself is 409", async () => {
    await refuses(409, asOwner, { userId: OWNER, tenantId: TENANT_A });
  });

  await t.step(
    "a member, another tenant's owner, or an agency owner is 403",
    async () => {
      await refuses(403, "Bearer member-token", {
        userId: OWNER,
        tenantId: TENANT_A,
      });
      await refuses(403, "Bearer other-owner-token", memberOfA);
      await refuses(403, asOwner, memberOfA, (w) => {
        w.roles[OWNER] = [{ role: "agency_owner", tenant_id: TENANT_A }];
      });
    },
  );

  await t.step("a super admin acting in another tenant is 403", async () => {
    await refuses(403, "Bearer admin-token", memberOfA, (w) => {
      w.activeTenant[ADMIN] = TENANT_B;
    });
  });

  await t.step("a super admin target is 409", async () => {
    await refuses(409, asOwner, { userId: ADMIN, tenantId: TENANT_A }, (w) => {
      w.memberships[`${TENANT_A}:${ADMIN}`] = "active";
    });
  });

  await t.step("a non-member or a missing login is 404", async () => {
    await refuses(404, asOwner, { userId: OTHER_OWNER, tenantId: TENANT_A });
    await refuses(404, asOwner, memberOfA, (w) => w.logins.delete(MEMBER));
  });
});

Deno.test("memberAdminHandler", async (t) => {
  const handler = (action: Parameters<typeof memberAdminHandler>[2]) =>
    memberAdminHandler("test", () => fakeStore(world()).store, action);
  const post = (body: string) =>
    new Request("https://edge.invalid/fn", { method: "POST", body });

  await t.step("answers the CORS preflight", async () => {
    const res = await handler(async () => ({}))(
      new Request("https://edge.invalid/fn", { method: "OPTIONS" }),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  });

  await t.step("a body that is not a JSON object is 400", async () => {
    const res = await handler(async () => ({}))(post("[1]"));
    assertEquals(res.status, 400);
    assertEquals((await res.json()).success, false);
  });

  await t.step("a refusal keeps its status and message", async () => {
    const res = await handler(async () => {
      throw new MemberAdminError(409, "last owner");
    })(post("{}"));
    assertEquals(res.status, 409);
    assertEquals(await res.json(), { success: false, error: "last owner" });
  });

  await t.step("any other failure is 500 with its message", async () => {
    const res = await handler(async () => {
      throw new Error("db down");
    })(post("{}"));
    assertEquals(res.status, 500);
    assertEquals(await res.json(), { success: false, error: "db down" });
  });

  await t.step("a result is 200 with success", async () => {
    const res = await handler(async () => ({ active: false }))(post("{}"));
    assertEquals(await res.json(), { success: true, active: false });
  });
});
