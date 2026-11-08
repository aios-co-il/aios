/**
 * The dates a shared dashboard link reads for a date filter preset, in UTC
 * and ending yesterday for the rolling presets. Every report on a share link
 * uses it, so its cards and tables cover the same period.
 */
export function sharedDashboardDateRange(filter: string): {
  startDate: string | null;
  endDate: string | null;
} {
  const now = new Date();
  // Compute everything in UTC so the range matches WooCommerce admin reports
  // and the woocommerce_orders.date_created column (stored as UTC timestamptz).
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const today = new Date(Date.UTC(y, m, d));
  const yesterday = new Date(Date.UTC(y, m, d - 1));
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const todayStr = today.toISOString().split("T")[0];
  let startDate: string | null = null;
  let endDate: string | null = null;

  switch (filter) {
    case "today":
      startDate = todayStr;
      endDate = todayStr;
      break;
    case "yesterday":
      startDate = yesterdayStr;
      endDate = yesterdayStr;
      break;
    case "this_week": {
      // Week starts Sunday (UTC calendar day) — matches SharedDashboard / DashboardView.
      const dow = today.getUTCDay();
      startDate = new Date(Date.UTC(y, m, d - dow)).toISOString().split("T")[0];
      endDate = todayStr;
      break;
    }
    case "last_week": {
      const dow = today.getUTCDay();
      startDate = new Date(Date.UTC(y, m, d - dow - 7))
        .toISOString()
        .split("T")[0];
      endDate = new Date(Date.UTC(y, m, d - dow - 1))
        .toISOString()
        .split("T")[0];
      break;
    }
    case "last_7_days": {
      // Rolling 7 full days ending yesterday — matches ads/analytics + combined dashboard.
      startDate = new Date(Date.UTC(y, m, d - 7)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    }
    case "this_month":
      startDate = new Date(Date.UTC(y, m, 1)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    case "last_month": {
      const startOfLastMonth = new Date(Date.UTC(y, m - 1, 1));
      const endOfLastMonth = new Date(Date.UTC(y, m, 0));
      startDate = startOfLastMonth.toISOString().split("T")[0];
      endDate = endOfLastMonth.toISOString().split("T")[0];
      break;
    }
    case "last_14_days":
      startDate = new Date(Date.UTC(y, m, d - 14)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    case "last_30_days":
      startDate = new Date(Date.UTC(y, m, d - 30)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    case "last_60_days":
      startDate = new Date(Date.UTC(y, m, d - 60)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    case "last_70_days":
      startDate = new Date(Date.UTC(y, m, d - 70)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    case "last_90_days":
      startDate = new Date(Date.UTC(y, m, d - 90)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    case "last_120_days":
      startDate = new Date(Date.UTC(y, m, d - 120)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    case "last_180_days":
      startDate = new Date(Date.UTC(y, m, d - 180)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    case "last_365_days":
      startDate = new Date(Date.UTC(y, m, d - 365)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
    case "all":
      return { startDate: null, endDate: null };
    default: // unknown preset — 30 full days ending yesterday
      startDate = new Date(Date.UTC(y, m, d - 30)).toISOString().split("T")[0];
      endDate = yesterdayStr;
      break;
  }

  return { startDate, endDate };
}
