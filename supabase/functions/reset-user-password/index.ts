// Lets an owner of the user's tenant, or a super admin, set another user's
// password, confirming the email so an invited user can log in with it.
import { corsHeaders } from "../_shared/cors.ts";
import { liveResetPasswordDeps } from "./deps.ts";
import { handleResetPassword } from "./handler.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return handleResetPassword(req, liveResetPasswordDeps());
});
