// The handler's dependencies in production: the service-role client, the
// caller's JWT, the Staging guard and the Manus gateway.
import { checkWhatsAppSend } from "../_shared/integration-guard.ts";
import { lineStore } from "../_shared/report-sender/line-store.ts";
import { requireAuth } from "../_shared/security.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { deliverManusMedia } from "./gateway.ts";
import type { FileSendDeps } from "./handler.ts";
import { ownManusLine } from "./line.ts";
import { recordSend } from "./record.ts";
import { findGroupChatId } from "./target.ts";
import { resolveTenantId } from "./tenant.ts";
import { uploadReportMedia } from "./upload.ts";

/** FileSendDeps over one service-role client for this request. */
export function liveFileSendDeps(): FileSendDeps {
  const admin = serviceClient();
  return {
    authenticate: requireAuth,
    store: lineStore(admin),
    ownManusLine: (tenantId, userId) => ownManusLine(admin, tenantId, userId),
    resolveTenantId: (request, userId) =>
      resolveTenantId(admin, request, userId),
    findGroupChatId: (tenantId, groupId) =>
      findGroupChatId(admin, tenantId, groupId),
    guard: checkWhatsAppSend,
    upload: (tenantId, file) => uploadReportMedia(admin, tenantId, file),
    deliver: (input) => deliverManusMedia(fetch, input),
    record: (send, media, outcome) => recordSend(admin, send, media, outcome),
  };
}
