// Binds a Google connect to the signed-in session. Google's redirect reaches
// the callback without an AIOS session, so the callback only verifies the
// state and hands the code to the app; the app, signed in, sends it back to
// `complete`, which exchanges it only when the state names that same user.
// Without this, a signed state could be sent to someone else, who would
// connect their Google account into the sender's AIOS account.
import { z } from "npm:zod@3.25.76";
import { tenantUserAccess } from "../auth/tenant-access.ts";
import { serviceClient, userClient } from "../supabase-clients.ts";
import {
  oauthStateSecret,
  type OAuthState,
  verifyOAuthState,
} from "./oauth-state.ts";

const completeBodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

/** A connect the signed-in user may complete. */
export type CompleteRequest = { code: string; state: OAuthState };

/** A tenant connect the signed-in user may complete. */
export type TenantCompleteRequest = CompleteRequest & { tenantId: string };

/** Why `complete` is refused, with the status to answer. */
export type CompleteRefusal = { status: 400 | 401 | 403; error: string };

/** The code and the verified state for the signed-in user, or why `complete` is refused. */
export async function readCompleteRequest(
  body: unknown,
  sessionUserId: string,
): Promise<CompleteRequest | CompleteRefusal> {
  const parsed = completeBodySchema.safeParse(body);
  if (!parsed.success) {
    return { status: 400, error: "Missing code or state" };
  }

  const state = await verifyOAuthState(parsed.data.state, oauthStateSecret());
  if (!state) {
    return {
      status: 400,
      error: "This connect link is invalid or has expired. Connect again.",
    };
  }

  if (state.userId !== sessionUserId) {
    return {
      status: 403,
      error:
        "This connect was started by another user. Connect again from your own account.",
    };
  }

  return { code: parsed.data.code, state };
}

/** `complete` for a tenant connect: the user comes from the JWT, the tenant from the verified state. */
export async function readTenantCompleteRequest(
  req: Request,
): Promise<TenantCompleteRequest | CompleteRefusal> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { status: 401, error: "Missing authorization header" };
  }

  const {
    data: { user },
    error,
  } = await userClient(authHeader).auth.getUser();
  if (error || !user) {
    return { status: 401, error: "Not signed in" };
  }

  const request = await readCompleteRequest(await req.json(), user.id);
  if (isCompleteRefusal(request)) {
    return request;
  }

  if (!request.state.tenantId) {
    return { status: 400, error: "This connect link has no organization" };
  }

  const refusal = await refuseFormerMember(request.state.tenantId, user.id);
  if (refusal) {
    return refusal;
  }

  return { ...request, tenantId: request.state.tenantId };
}

/**
 * A refusal when the user is no longer a member (or a super admin) of the
 * tenant the connect was started for: membership is checked at `authorize`,
 * and the user may have been removed in the minutes before `complete`.
 */
export async function refuseFormerMember(
  tenantId: string,
  userId: string,
): Promise<CompleteRefusal | null> {
  const access = await tenantUserAccess(serviceClient(), tenantId, userId);

  return access.member || access.superAdmin
    ? null
    : { status: 403, error: "You are not a member of this organization" };
}

/** Whether `complete` was refused. */
export function isCompleteRefusal<T extends CompleteRequest>(
  result: T | CompleteRefusal,
): result is CompleteRefusal {
  return "status" in result;
}
