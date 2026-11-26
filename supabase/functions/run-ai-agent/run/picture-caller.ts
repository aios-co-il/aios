import type { PictureCaller } from "../attachments/picture-request.ts";
import type { RunState } from "./state.ts";

/**
 * Who sends this turn's pictures: the signed-in caller's own folder, or, from the WhatsApp
 * webhooks' service call, the turn's own org folder (AIO-683). Both the request reader and the
 * picture store take it, so they always agree on the bucket.
 */
export function pictureCallerOf(run: RunState): PictureCaller {
  return {
    authKind: run.input.request.authKind,
    userId: run.callerUserId,
    surface: run.input.surface,
    tenantId: run.resolvedTenantId,
  };
}
