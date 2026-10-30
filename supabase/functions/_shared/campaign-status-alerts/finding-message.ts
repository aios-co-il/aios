/** The WhatsApp text of a status finding, naming the client and the platform. */
import type {
  AdPlatform,
  Finding,
  ReportAccount,
  StatusAlertType,
} from "./types.ts";

const PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: "Meta",
  google: "Google Ads",
};

const MANAGER_LABELS: Record<AdPlatform, string> = {
  meta: "Ads Manager",
  google: "Google Ads",
};

function problemLabel(type: StatusAlertType, platform: string): string {
  switch (type) {
    case "account_disabled":
      return "חשבון הפרסום הושבת או הוגבל";
    case "ad_account_billing_issue":
      return "מודעות ממתינות לפרטי תשלום — בעיית חיוב";
    case "campaign_stopped":
      return `הקמפיין נעצר ע״י ${platform}`;
    case "campaign_with_issues":
      return "תקלה בקמפיין";
    case "ad_disapproved":
      return `מודעה נפסלה ע״י ${platform} בקמפיין פעיל`;
    case "no_live_ads":
      return `אין אף מודעה באוויר ב-${platform}, והדוח מסומן פעיל`;
  }
}

/** The WhatsApp text of a finding, naming the client. */
export function findingMessage(
  report: ReportAccount,
  finding: Finding,
): string {
  const reason =
    typeof finding.details.reason === "string"
      ? finding.details.reason
      : problemLabel(finding.alert_type, PLATFORM_LABELS[report.platform]);
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
    lines.push(
      "",
      `בדיקה מומלצת: לפתוח את ${MANAGER_LABELS[report.platform]} ואת דשבורד הדופק.`,
    );
  }
  return lines.join("\n");
}
