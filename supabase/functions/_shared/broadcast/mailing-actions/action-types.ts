// The automation action types handled by the mailing actions. Dependency-free
// so the frontend can import it too.

export const MAILING_ACTION_TYPES = [
  "add_to_mailing_list",
  "remove_from_mailing_list",
  "send_template_to_contact",
  "send_template_to_list",
  "sync_mailing_list",
] as const;
export type MailingActionType = (typeof MAILING_ACTION_TYPES)[number];
