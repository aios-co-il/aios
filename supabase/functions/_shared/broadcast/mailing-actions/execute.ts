// Mailing-list and template actions for the automation engine
// (trigger-automation): dispatch an action to its handler. All sends go
// through the broadcast pipeline so throttling, opt-outs, unsubscribe links
// and stats work the same as a manual broadcast.
//
//   add_to_mailing_list       { list_id, entity? }
//   remove_from_mailing_list  { list_id, entity? }
//   send_template_to_contact  { template_id, entity?, integration_id?, sender_domain_id?, from_mode?, from_local?, from_name? }
//   send_template_to_list     { template_id, list_id, min_interval_hours?, integration_id?, sender_domain_id?, ... }
//   sync_mailing_list         { list_id } — adds the trigger's lead/client when it
//                             matches the list's CRM filter, removes it when not
//
// entity: 'auto' (default) | 'lead' | 'client'.
import type { DbClient } from "../../supabase-clients.ts";
import {
  executeAddToMailingList,
  executeRemoveFromMailingList,
} from "./list-membership.ts";
import { executeSendTemplateToContact } from "./send-to-contact.ts";
import { executeSendTemplateToList } from "./send-to-list.ts";
import { executeSyncMailingList } from "./sync-list.ts";
import type { MailingActionContext, MailingActionType } from "./types.ts";

export async function executeMailingAction(
  actionType: MailingActionType,
  db: DbClient,
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
