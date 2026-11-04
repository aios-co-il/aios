import { assertEquals } from "jsr:@std/assert@1";
import type { CallerRole } from "../_shared/user-admin/role-grant.ts";
import {
  handleResetPassword,
  type PasswordUpdate,
  type ResetPasswordDeps,
} from "./handler.ts";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const OWNER = "user-owner";
const OTHER_OWNER = "user-other-owner";
const MEMBER = "user-member";
const SUPER_ADMIN = "user-super-admin";
const INVITED = "user-invited";
const TARGET_SUPER_ADMIN = "user-target-super-admin";

type Update = { userId: string; update: PasswordUpdate };

/** Every fake user's user_roles rows. */
const ROLES: Record<string, Array<CallerRole>> = {
  [OWNER]: [{ role: "owner", tenant_id: TENANT_A }],
  [OTHER_OWNER]: [{ role: "owner", tenant_id: TENANT_B }],
  [MEMBER]: [{ role: "member", tenant_id: TENANT_A }],
  [SUPER_ADMIN]: [{ role: "super_admin", tenant_id: null }],
  [TARGET_SUPER_ADMIN]: [
    { role: "super_admin", tenant_id: null },
    { role: "member", tenant_id: TENANT_A },
  ],
};

/** Every fake user's tenant_users memberships. */
const TENANTS: Record<string, Array<string>> = {
  [OWNER]: [TENANT_A],
  [OTHER_OWNER]: [TENANT_B],
  [MEMBER]: [TENANT_A],
  [INVITED]: [TENANT_A],
  [TARGET_SUPER_ADMIN]: [TENANT_A],
};

/** Deps where "<name>-jwt" is that fake user, over ROLES and TENANTS. */
function fakeDeps(overrides: Partial<ResetPasswordDeps> = {}) {
  const updates: Array<Update> = [];
  const deps: ResetPasswordDeps = {
    callerId: async (token) =>
      ({
        "owner-jwt": OWNER,
        "other-owner-jwt": OTHER_OWNER,
        "member-jwt": MEMBER,
        "super-admin-jwt": SUPER_ADMIN,
      })[token] ?? null,
    rolesOf: async (userId) => ROLES[userId] ?? [],
    tenantsOf: async (userId) => TENANTS[userId] ?? [],
    updateUser: async (userId, update) => {
      updates.push({ userId, update });
      return null;
    },
    ...overrides,
  };
  return { deps, updates };
}

/** A reset request with the body and the Authorization header given. */
function resetRequest(
  body: unknown,
  authHeader: string | null = "Bearer owner-jwt",
): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }
  return new Request("http://localhost/reset-user-password", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

/** The handler's status and parsed body for the request. */
async function reset(req: Request, deps: ResetPasswordDeps) {
  const response = await handleResetPassword(req, deps);
  return { status: response.status, body: await response.json() };
}

Deno.test("handleResetPassword", async (t) => {
  await t.step(
    "lets an owner of the user's tenant set the password and confirm the email",
    async () => {
      const { deps, updates } = fakeDeps();
      const result = await reset(
        resetRequest({ userId: INVITED, newPassword: "secret123" }),
        deps,
      );

      assertEquals(result, { status: 200, body: { success: true } });
      assertEquals(updates, [
        {
          userId: INVITED,
          update: { password: "secret123", email_confirm: true },
        },
      ]);
    },
  );

  await t.step("refuses an owner of another tenant with 403", async () => {
    const { deps, updates } = fakeDeps();
    const result = await reset(
      resetRequest(
        { userId: INVITED, newPassword: "secret123" },
        "Bearer other-owner-jwt",
      ),
      deps,
    );

    assertEquals(result.status, 403);
    assertEquals(updates, []);
  });

  await t.step(
    "refuses an owner resetting a super admin of their tenant",
    async () => {
      const { deps, updates } = fakeDeps();
      const result = await reset(
        resetRequest({ userId: TARGET_SUPER_ADMIN, newPassword: "secret123" }),
        deps,
      );

      assertEquals(result.status, 403);
      assertEquals(updates, []);
    },
  );

  await t.step(
    "lets a super admin reset any user, a super admin included",
    async () => {
      const { deps, updates } = fakeDeps();
      for (const userId of [INVITED, TARGET_SUPER_ADMIN]) {
        const result = await reset(
          resetRequest(
            { userId, newPassword: "secret123" },
            "Bearer super-admin-jwt",
          ),
          deps,
        );
        assertEquals(result.status, 200);
      }

      assertEquals(
        updates.map((u) => u.userId),
        [INVITED, TARGET_SUPER_ADMIN],
      );
    },
  );

  await t.step(
    "refuses a member of the tenant without a reset role",
    async () => {
      const { deps, updates } = fakeDeps();
      const result = await reset(
        resetRequest(
          { userId: INVITED, newPassword: "secret123" },
          "Bearer member-jwt",
        ),
        deps,
      );

      assertEquals(result.status, 403);
      assertEquals(updates, []);
    },
  );

  await t.step("refuses a missing, unprefixed or invalid token", async () => {
    const { deps, updates } = fakeDeps();
    const body = { userId: INVITED, newPassword: "secret123" };

    assertEquals((await reset(resetRequest(body, null), deps)).status, 401);
    assertEquals(
      (await reset(resetRequest(body, "owner-jwt"), deps)).status,
      401,
    );
    assertEquals(
      (await reset(resetRequest(body, "Bearer bad-jwt"), deps)).status,
      401,
    );
    assertEquals(updates, []);
  });

  await t.step("rejects a password shorter than 6 characters", async () => {
    const { deps, updates } = fakeDeps();
    const result = await reset(
      resetRequest({ userId: INVITED, newPassword: "12345" }),
      deps,
    );

    assertEquals(result.status, 400);
    assertEquals(updates, []);
  });

  await t.step("returns a generic 500 when the admin API fails", async () => {
    const { deps } = fakeDeps({ updateUser: async () => "User not found" });
    const result = await reset(
      resetRequest({ userId: INVITED, newPassword: "secret123" }),
      deps,
    );

    assertEquals(result, {
      status: 500,
      body: { success: false, error: "Failed to reset password" },
    });
  });

  await t.step("returns a generic 500 when a lookup fails", async () => {
    const { deps, updates } = fakeDeps({
      tenantsOf: async () => {
        throw new Error("tenant_users lookup failed: timeout");
      },
    });
    const result = await reset(
      resetRequest({ userId: INVITED, newPassword: "secret123" }),
      deps,
    );

    assertEquals(result, {
      status: 500,
      body: { success: false, error: "Failed to reset password" },
    });
    assertEquals(updates, []);
  });
});
