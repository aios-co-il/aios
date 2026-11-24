// The `authorize` step of the Google connect flows that connect a tenant
// (Analytics, Search Console): the caller is the signed-in user from the JWT,
// never a userId from the body, and must belong to the tenant.
import { z } from "npm:zod@3.25.76";
import { tenantUserAccess } from "../auth/tenant-access.ts";
import { serviceClient, userClient } from "../supabase-clients.ts";
import { allowedAppOrigin } from "./app-origin.ts";
import type { OAuthStateInput } from "./oauth-state.ts";

const connectBodySchema = z.object({
  tenantId: z.string().uuid(),
  addNew: z.boolean().optional(),
  origin: z.string().nullish(),
  loginHint: z.string().nullish(),
});

/** A connect the caller may start: what to sign into the state, and the account to preselect. */
export type ConnectRequest = {
  state: OAuthStateInput;
  loginHint: string | null;
};

/** Why a connect may not start, with the status to answer. */
export type ConnectRefusal = { status: 400 | 401 | 403; error: string };

/** The connect the caller asked for, or why it is refused. */
export async function readConnectRequest(
  req: Request,
): Promise<ConnectRequest | ConnectRefusal> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { status: 401, error: "Missing authorization header" };
  }

  const {
    data: { user },
    error: userError,
  } = await userClient(authHeader).auth.getUser();
  if (userError || !user) {
    return { status: 401, error: "Not signed in" };
  }

  const body = connectBodySchema.safeParse(await req.json());
  if (!body.success) {
    return { status: 400, error: "Missing or invalid tenantId" };
  }

  const { tenantId, addNew, origin, loginHint } = body.data;
  const access = await tenantUserAccess(serviceClient(), tenantId, user.id);
  if (!access.member && !access.superAdmin) {
    return { status: 403, error: "You are not a member of this organization" };
  }

  return {
    state: {
      userId: user.id,
      tenantId,
      origin: allowedAppOrigin(origin ?? req.headers.get("origin")),
      addNew: addNew ?? false,
    },
    loginHint: loginHint ?? null,
  };
}

/** Whether the connect was refused. */
export function isConnectRefusal(
  result: ConnectRequest | ConnectRefusal,
): result is ConnectRefusal {
  return "status" in result;
}
