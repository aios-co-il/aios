/**
 * Hebrew text for a refused recipient write. The DB guard
 * (carmen_report_recipients_guard) raises check_violation for both a client
 * phone and a non-staff user, so its message tells them apart.
 */
export function recipientSaveError(error: Error): string {
  if (error.message.includes("client phone")) {
    return "המספר שייך ללקוח — כרמן לא מדווחת ללקוחות";
  }
  if (error.message.includes("not staff")) {
    return "המשתמש אינו בצוות הארגון";
  }
  return "שגיאה בשמירת נמען הדיווח";
}
