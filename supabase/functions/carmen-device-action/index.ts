/**
 * carmen-device-action (AIO-667): the extension's panel claims and completes a device
 * action with the user's session. See handler.ts.
 */
import { requireAuth } from "../_shared/security.ts";
import { serviceClient, userClient } from "../_shared/supabase-clients.ts";
import { type DeviceActionDeps, handleDeviceAction } from "./handler.ts";

Deno.serve((req) => handleDeviceAction(req, liveDeps()));

/** The caller's identity, a client that reads as them, and the service client for the guarded writes. */
function liveDeps(): DeviceActionDeps {
  return {
    caller: requireAuth,
    userDb: userClient,
    serviceDb: serviceClient,
    now: () => new Date(),
  };
}
