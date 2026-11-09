import { bindToolRoute, type ToolRoute } from "../route.ts";
import { executeGetDashboardStats } from "../../executors/get-dashboard-stats.ts";
import { executeListFacebookAdAccounts } from "../../executors/list-facebook-ad-accounts.ts";
import { executeCreateFacebookReportTable } from "../../executors/create-facebook-report-table.ts";
import { executeVerifyReportVsMeta } from "../../executors/verify-report-vs-meta.ts";
import { executeGetReconciliationStatus } from "../../executors/get-reconciliation-status.ts";
import { executeCheckAdAccountsHealth } from "../../executors/check-ad-accounts-health.ts";
import { executeListUnconnectedClients } from "../../executors/list-unconnected-clients.ts";

/** ad-report tool routes; argument assertions retain the legacy tool boundary. */
export const adReportRoutes: Record<string, ToolRoute> = {
  get_dashboard_stats: bindToolRoute(executeGetDashboardStats),
  list_facebook_ad_accounts: bindToolRoute(executeListFacebookAdAccounts),
  create_facebook_report_table: bindToolRoute(executeCreateFacebookReportTable),
  verify_report_vs_meta: bindToolRoute(executeVerifyReportVsMeta),
  get_reconciliation_status: bindToolRoute(executeGetReconciliationStatus),
  check_ad_accounts_health: bindToolRoute(executeCheckAdAccountsHealth),
  list_unconnected_clients: bindToolRoute(executeListUnconnectedClients),
};
