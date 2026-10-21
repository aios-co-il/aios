// Mailing-list and template actions for the automation engine
// (trigger-automation). All sends go through the broadcast pipeline so
// throttling, opt-outs, unsubscribe links and stats work the same as a
// manual broadcast.
//
//   add_to_mailing_list       { list_id, entity? }
//   remove_from_mailing_list  { list_id, entity? }
//   send_template_to_contact  { template_id, entity?, integration_id?, sender_domain_id?, from_mode?, from_local?, from_name? }
//   send_template_to_list     { template_id, list_id, min_interval_hours?, integration_id?, sender_domain_id?, ... }
//   sync_mailing_list         { list_id } — adds the trigger's lead/client when it
//                             matches the list's CRM filter, removes it when not
//
// entity: 'auto' (default) | 'lead' | 'client'.
//
// Barrel: the implementation lives in ./mailing-actions/.
export {
  MAILING_ACTION_TYPES,
  type MailingActionContext,
  type MailingActionType,
} from "./mailing-actions/types.ts";
export { resolveTargetEntity } from "./mailing-actions/target.ts";
export {
  executeAddToMailingList,
  executeRemoveFromMailingList,
} from "./mailing-actions/list-membership.ts";
export { executeSendTemplateToContact } from "./mailing-actions/send-to-contact.ts";
export { executeSendTemplateToList } from "./mailing-actions/send-to-list.ts";
export { executeSyncMailingList } from "./mailing-actions/sync-list.ts";
export { executeMailingAction } from "./mailing-actions/execute.ts";
