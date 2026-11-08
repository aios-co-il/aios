/** analyze_campaign_performance's entry for a client it has no fresh numbers for. */
import type { PerformanceClient } from "./client-performance.ts";

/** A client whose campaign tables have no rows in the last 30 days, or could not be read. */
export function staleClientEntry(
  client: PerformanceClient,
  readFailed = false,
) {
  return {
    client_id: client.id,
    client_name: client.name,
    agency_name: client.agencies?.name ?? null,
    is_ecommerce: false,
    spend_7d: 0,
    spend_30d: 0,
    lead_spend_7d: 0,
    ecommerce_spend_7d: 0,
    leads_7d: 0,
    leads_30d: 0,
    cpl_7d: null,
    cpl_30d_avg: null,
    purchases_7d: 0,
    purchases_30d: 0,
    revenue_7d: 0,
    revenue_30d: 0,
    cpp_7d: null,
    cpp_change_pct: null,
    roas_7d: null,
    profit_7d: 0,
    spend_change_pct: null,
    cpl_change_pct: null,
    last_data_date: null,
    last_campaign_update: null,
    days_since_last_campaign_touch: null,
    sync_status: readFailed ? "read_failed" : "stale_or_empty",
    alert: readFailed
      ? "🟡 לא הצלחתי לקרוא את נתוני הקמפיין — לבדוק שוב"
      : "🟡 סנכרון ישן או חסר — טבלת קמפיין מחוברת אך אין נתונים ב-30 הימים האחרונים",
  };
}
