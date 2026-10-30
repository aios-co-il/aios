import type { ReportRecipientSkipReason } from "../../../../supabase/functions/_shared/carmen-report-recipients/resolve.ts";

/** Why Carmen will not send to a configured recipient, as shown to owners. */
export const SKIP_WARNINGS: Record<ReportRecipientSkipReason, string> = {
  member_without_phone: "אין טלפון בכרטיס — כרמן לא תוכל לשלוח",
  not_staff: "כבר לא בצוות הארגון — כרמן לא תשלח",
  invalid_phone: "הטלפון בכרטיס לא תקין — כרמן לא תוכל לשלוח",
  duplicate_phone: "אותו טלפון כבר ברשימה — יישלח פעם אחת",
  client_phone: "המספר שייך ללקוח — כרמן לא תשלח אליו",
};
