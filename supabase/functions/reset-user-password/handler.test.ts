import { assertEquals } from "jsr:@std/assert@1";
import {
  handleResetPassword,
  type PasswordUpdate,
  type ResetPasswordDeps,
} from "./handler.ts";

const OWNER = "user-owner";
const MEMBER = "user-member";
const INVITED = "user-invited";

type Update = { userId: string; update: PasswordUpdate };

/** Deps where "owner-jwt" is an owner and "member-jwt" holds no reset role. */
function fakeDeps(overrides: Partial<ResetPasswordDeps> = {}) {
  const updates: Update[] = [];
  const deps: ResetPasswordDeps = {
    callerId: async (token) =>
      ({ "owner-jwt": OWNER, "member-jwt": MEMBER })[token] ?? null,
    rolesOf: async (userId) => (userId === OWNER ? ["owner"] : ["member"]),
    updateUser: async (userId, update) => {
      updates.push({ userId, update });
      return null;
    },
    ...overrides,
  };
  return { deps, updates };
}

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

async function reset(req: Request, deps: ResetPasswordDeps) {
  const response = await handleResetPassword(req, deps);
  return { status: response.status, body: await response.json() };
}

Deno.test("handleResetPassword", async (t) => {
  await t.step("sets the password and confirms the email", async () => {
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
  });

  await t.step("refuses a caller without a reset role", async () => {
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
  });

  await t.step("refuses a missing or invalid token", async () => {
    const { deps, updates } = fakeDeps();
    const body = { userId: INVITED, newPassword: "secret123" };

    assertEquals((await reset(resetRequest(body, null), deps)).status, 401);
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

  await t.step("returns the admin API error as a 500", async () => {
    const { deps } = fakeDeps({ updateUser: async () => "User not found" });
    const result = await reset(
      resetRequest({ userId: INVITED, newPassword: "secret123" }),
      deps,
    );

    assertEquals(result, {
      status: 500,
      body: { success: false, error: "User not found" },
    });
  });

  await t.step("returns a failed roles lookup as a 500", async () => {
    const { deps, updates } = fakeDeps({
      rolesOf: async () => {
        throw new Error("user_roles lookup failed: timeout");
      },
    });
    const result = await reset(
      resetRequest({ userId: INVITED, newPassword: "secret123" }),
      deps,
    );

    assertEquals(result.status, 500);
    assertEquals(updates, []);
  });
});
