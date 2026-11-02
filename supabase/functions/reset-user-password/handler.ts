// An owner or super admin sets another user's password. Dependencies are
// injected so handler.test.ts checks the admin update without Supabase.
import { corsHeaders } from "../_shared/cors.ts";

/** The attributes the admin API receives for the user being reset. */
export type PasswordUpdate = { password: string; email_confirm: true };

/** Reads and the one write the reset needs, over the service-role client. */
export type ResetPasswordDeps = {
  /** The id of the user behind a bearer token, or null when it is invalid. */
  callerId(token: string): Promise<string | null>;
  /** Every role the user holds in user_roles. */
  rolesOf(userId: string): Promise<string[]>;
  /** Applies the update; the error message, or null on success. */
  updateUser(userId: string, update: PasswordUpdate): Promise<string | null>;
};

const RESET_ROLES = ["owner", "super_admin"];

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

    const denied = await deniedCaller(req, deps);
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
      return reply({ success: false, error }, 500);
    }
    return reply({ success: true }, 200);
  } catch (error) {
    console.error("Error in reset-user-password function:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return reply({ success: false, error: errorMessage }, 500);
  }
}

/** A 400 when the body lacks a user or holds a too-short password. */
function invalidRequest(userId: unknown, newPassword: unknown) {
  if (!userId || !newPassword || typeof newPassword !== "string") {
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

/** A 401 or 403 unless the caller is an owner or super admin. */
async function deniedCaller(req: Request, deps: ResetPasswordDeps) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return reply(
      { success: false, error: "Missing authorization header" },
      401,
    );
  }
  const callerId = await deps.callerId(authHeader.replace("Bearer ", ""));
  if (!callerId) {
    return reply({ success: false, error: "Unauthorized" }, 401);
  }
  const roles = await deps.rolesOf(callerId);
  if (!roles.some((role) => RESET_ROLES.includes(role))) {
    return reply(
      {
        success: false,
        error: "Only owners and super admins can reset passwords",
      },
      403,
    );
  }
  return null;
}

/** A JSON response with the CORS headers. */
function reply(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
