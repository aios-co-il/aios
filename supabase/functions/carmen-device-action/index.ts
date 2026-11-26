/**
 * carmen-device-action (AIO-667): the extension's panel claims and completes a device
 * action with the user's session. See handler.ts.
 */
import { requireAuth } from "../_shared/security.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import { type DeviceActionDeps, handleDeviceAction } from "./handler.ts";

Deno.serve((req) => handleDeviceAction(req, liveDeps()));

/** The signed-in user, a client that reads as them, and the service client for the guarded writes. */
function liveDeps(): DeviceActionDeps {
  return {
    async userId(req) {
      const caller = await requireAuth(req);
      // The service key is no user: only a person's own session claims or completes.
      return caller?.kind === "user" ? caller.userId : null;
    },
    userDb: userClient,
    serviceDb: serviceClient,
    now: () => new Date(),
  };
}
