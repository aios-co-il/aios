import {
  REPORT_NEGATIVE,
  REPORT_POSITIVE,
} from "@/components/report-ui/ReportTable";
import type { FacebookCampaignRow } from "@/lib/adsMetrics";
import { purchaseValueUnreported } from "@/lib/dashboardCombinedFigures";
import { ratio } from "@/lib/reportNumber";
import { facebookTabTotals } from "./facebookTabFigures";

/** ROAS as "2.40x"; a dash when the purchases carry no value. */
export function roasText(rows: Array<FacebookCampaignRow>): string {
  const { purchases, purchase_value, spend } = facebookTabTotals(rows);
  if (purchaseValueUnreported({ purchases, revenue: purchase_value })) {
    return "-";
  }
  const roas = ratio(purchase_value, spend);
  return roas > 0 ? `${roas.toFixed(2)}x` : "0x";
}

/** The accent at break-even or better, red below it. */
export function roasTone(rows: Array<FacebookCampaignRow>): string | undefined {
  const { purchases, purchase_value, spend } = facebookTabTotals(rows);
  if (purchaseValueUnreported({ purchases, revenue: purchase_value })) {
    return undefined;
  }
  const roas = ratio(purchase_value, spend);
  if (roas >= 1) {
    return REPORT_POSITIVE;
  }
  return roas > 0 ? REPORT_NEGATIVE : undefined;
}
