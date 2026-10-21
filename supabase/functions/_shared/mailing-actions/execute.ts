// Dispatch a mailing automation action to its handler.
import {
  executeAddToMailingList,
  executeRemoveFromMailingList,
} from "./list-membership.ts";
import { executeSendTemplateToContact } from "./send-to-contact.ts";
import { executeSendTemplateToList } from "./send-to-list.ts";
import { executeSyncMailingList } from "./sync-list.ts";
import type { Db, MailingActionContext, MailingActionType } from "./types.ts";

export async function executeMailingAction(
  actionType: MailingActionType,
  db: Db,
  config: Record<string, unknown>,
  data: Record<string, unknown>,
  tenantId: string,
  ctx: MailingActionContext,
) {
  switch (actionType) {
    case "add_to_mailing_list":
      return executeAddToMailingList(db, config, data, tenantId, ctx);
    case "remove_from_mailing_list":
      return executeRemoveFromMailingList(db, config, data, tenantId, ctx);
    case "send_template_to_contact":
      return executeSendTemplateToContact(db, config, data, tenantId, ctx);
    case "send_template_to_list":
      return executeSendTemplateToList(db, config, data, tenantId, ctx);
    case "sync_mailing_list":
      return executeSyncMailingList(db, config, data, tenantId, ctx);
  }
}
