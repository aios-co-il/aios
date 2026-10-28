/** The WhatsApp text of a monitor finding (see findings.ts). */
import type { Finding, MonitorAlertType, ReportAccount } from "./types.ts";

const PROBLEM_LABELS: Record<MonitorAlertType, string> = {
  account_disabled: "חשבון הפרסום הושבת או הוגבל",
  ad_account_billing_issue: "מודעות ממתינות לפרטי תשלום — בעיית חיוב",
  campaign_stopped: "הקמפיין נעצר ע״י Meta",
  campaign_with_issues: "תקלה בקמפיין",
  ad_disapproved: "מודעה נפסלה ע״י Meta בקמפיין פעיל",
  no_live_ads: "אין אף מודעה באוויר, והדוח מסומן פעיל",
};

/** The WhatsApp text of a finding, naming the client. */
export function findingMessage(
  report: ReportAccount,
  finding: Finding,
): string {
  const reason =
    typeof finding.details.reason === "string"
      ? finding.details.reason
      : PROBLEM_LABELS[finding.alert_type];
  const lines = [
    `${finding.severity === "critical" ? "🔴" : "🟡"} התראת קמפיין — ${report.clientName || "לקוח"}`,
  ];
  if (!finding.campaign_id.startsWith("account:") && finding.campaign_name) {
    lines.push(`קמפיין: ${finding.campaign_name}`);
  }
  lines.push(`הבעיה: ${reason}`);
  if (finding.alert_type === "no_live_ads") {
    lines.push(
      "",
      "אם הלקוח הושהה בכוונה — לסמן את הדוח שלו כלא פעיל, וההתראה תיפסק.",
    );
  } else {
    lines.push("", "בדיקה מומלצת: לפתוח את Ads Manager ואת דשבורד הדופק.");
  }
  return lines.join("\n");
}
