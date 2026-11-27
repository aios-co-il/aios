/**
 * carmen-device-action (AIO-667): the extension's panel claims and completes a device
 * action with the user's session. See handler.ts.
 */
import { requireAuth } from "../_shared/security.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { type DeviceActionDeps, handleDeviceAction } from "./handler.ts";

Deno.serve((req) => handleDeviceAction(req, liveDeps()));

/** The caller's identity and the service client for the reads and the guarded writes. */
function liveDeps(): DeviceActionDeps {
  return {
    caller: requireAuth,
    serviceDb: serviceClient,
    now: () => new Date(),
  };
}
