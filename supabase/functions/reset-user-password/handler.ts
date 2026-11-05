// An owner of the user's tenant, or a super admin, sets another user's
// password. Dependencies are injected so handler.test.ts checks the caller
// scoping and the admin update without Supabase.
import { bearerFrom } from "../_shared/auth/edge-caller-auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  type CallerRole,
  isGlobalSuperAdmin,
} from "../_shared/user-admin/role-grant.ts";

/** The attributes the admin API receives for the user being reset. */
export type PasswordUpdate = { password: string; email_confirm: true };

/** Reads and the one write the reset needs, over the service-role client. */
export type ResetPasswordDeps = {
  /** The id of the user behind a bearer token, or null when it is invalid. */
  callerId(token: string): Promise<string | null>;
  /** Every user_roles row of the user, with its tenant. */
  rolesOf(userId: string): Promise<Array<CallerRole>>;
  /** The tenants the user is a member of (tenant_users). */
  tenantsOf(userId: string): Promise<Array<string>>;
  /** Applies the update; the error message, or null on success. */
  updateUser(userId: string, update: PasswordUpdate): Promise<string | null>;
};

const RESET_ROLES = ["owner", "super_admin"];
const RESET_FAILED = "Failed to reset password";

/** Checks the request and the caller, then sets the password. */
export async function handleResetPassword(
  req: Request,
  deps: ResetPasswordDeps,
): Promise<Response> {
  try {
    const { userId, newPassword } = await req.json();
    const invalid = invalidRequest(userId, newPassword);
    if (invalid) {
      return invalid;
    }

    const denied = await deniedCaller(req, deps, userId);
    if (denied) {
      return denied;
    }

    // Invited users have no email_confirmed_at, so signInWithPassword rejects
    // them even after an admin sets a password; confirming lets them log in.
    const error = await deps.updateUser(userId, {
      password: newPassword,
      email_confirm: true,
    });
    if (error) {
      console.error("Error resetting password:", error);
      return reply({ success: false, error: RESET_FAILED }, 500);
    }
    return reply({ success: true }, 200);
  } catch (error) {
    console.error("Error in reset-user-password function:", error);
    return reply({ success: false, error: RESET_FAILED }, 500);
  }
}

/** A 400 when the body lacks a user or holds a too-short password. */
function invalidRequest(userId: unknown, newPassword: unknown) {
  if (
    !userId ||
    typeof userId !== "string" ||
    !newPassword ||
    typeof newPassword !== "string"
  ) {
    return reply(
      { success: false, error: "Missing userId or newPassword" },
      400,
    );
  }
  if (newPassword.length < 6) {
    return reply(
      { success: false, error: "הסיסמה חייבת להכיל לפחות 6 תווים" },
      400,
    );
  }
  return null;
}

/**
 * A 401 or 403 unless the caller is a super admin, or holds a reset role in a
 * tenant the target user belongs to. Only a super admin resets a super admin.
 */
async function deniedCaller(
  req: Request,
  deps: ResetPasswordDeps,
  targetId: string,
) {
  const token = bearerFrom(req.headers.get("Authorization"));
  if (!token) {
    return reply(
      { success: false, error: "Missing authorization header" },
      401,
    );
  }
  const callerId = await deps.callerId(token);
  if (!callerId) {
    return reply({ success: false, error: "Unauthorized" }, 401);
  }
  const callerRoles = await deps.rolesOf(callerId);
  if (isGlobalSuperAdmin(callerRoles)) {
    return null;
  }
  const [targetRoles, targetTenants] = await Promise.all([
    deps.rolesOf(targetId),
    deps.tenantsOf(targetId),
  ]);
  // One message for both refusals, so a caller cannot learn who is a super
  // admin or which tenants a user belongs to.
  if (
    isGlobalSuperAdmin(targetRoles) ||
    !holdsResetRoleIn(callerRoles, targetTenants)
  ) {
    return reply(
      {
        success: false,
        error:
          "Only an owner of the user's tenant or a super admin can reset this password",
      },
      403,
    );
  }
  return null;
}

/** Whether one of the caller's reset roles is scoped to one of the tenants. */
function holdsResetRoleIn(
  roles: ReadonlyArray<CallerRole>,
  tenantIds: ReadonlyArray<string>,
): boolean {
  return roles.some(
    (r) =>
      r.tenant_id !== null &&
      RESET_ROLES.includes(r.role) &&
      tenantIds.includes(r.tenant_id),
  );
}

/** A JSON response with the CORS headers. */
function reply(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
