import type { PulseGoalRow } from "../../_shared/campaign-pulse.ts";
import { goalLabel } from "../../_shared/campaign-pulse.ts";
import { NO_RECENT_CLIENT_CALL_TEXT } from "../../_shared/pulse/client-call.ts";
import type { loadPulseCacheRows } from "./pulse-cache-rows.ts";

/** Builds the existing pulse table text without changing headers or cell ordering. */
export function pulseTableLines(
  goalRows: Array<PulseGoalRow>,
  normalizedRows: Awaited<ReturnType<typeof loadPulseCacheRows>>,
) {
  const statusLabel: Record<string, string> = {
    healthy: "🟢 תקין",
    warning: "🟡 תשומת לב",
    critical: "🔴 קריטי",
    // no_data = no campaign report table connected. Stale sync is warning, not no_data.
    no_data: "🟡 אין טבלת קמפיין מחוברת",
  };
  /** Retains the pulse table's fmtNumber rendering. */
  function fmtNumber(value: unknown) {
    return value === null || value === undefined ? "—" : String(value);
  }
  /** Retains the pulse table's fmtDate rendering. */
  function fmtDate(value: string | null | undefined) {
    return value
      ? new Date(value).toLocaleDateString("he-IL", {
          timeZone: "Asia/Jerusalem",
          day: "numeric",
          month: "numeric",
          year: "numeric",
        })
      : "—";
  }
  /** Retains the pulse table's escapeCell rendering. */
  function escapeCell(value: unknown) {
    return String(value ?? "—")
      .replace(/\|/g, "\\|")
      .replace(/\n/g, " ");
  }
  return [
    '| סוכנות | לקוח | יעד | סטטוס | הוצאה 7 ימים | לידים/רכישות | CPL/ROAS | שינוי | שיחת לקוח אחרונה | תועדה ע"י | שינוי במטה | הערה |',
    "|---|---|---|---:|---:|---:|---:|---|---|---|---|",
    ...goalRows.map((row) => {
      const outcomes = fmtNumber(row.outcomes_7d);
      const efficiencyLabel =
        row.efficiency_kind === "roas"
          ? `ROAS ${fmtNumber(row.efficiency)}`
          : `₪${fmtNumber(row.efficiency)}`;
      const change =
        row.change_pct === null || row.change_pct === undefined
          ? "—"
          : `${row.change_pct > 0 ? "+" : ""}${row.change_pct}%`;
      const metaChange = row.last_meta_change_at
        ? fmtDate(row.last_meta_change_at)
        : row.meta_change_availability === "no_campaign_change_in_30d"
          ? "לא נמצא ב-30 יום"
          : "לא זמין";
      const snapshotRow = normalizedRows.find(
        (client) => client.client_id === row.client_id,
      );
      const agencyName = snapshotRow?.agency_name;
      const lastCall = fmtDate(snapshotRow?.last_client_call_at);
      const callCell = snapshotRow?.no_recent_client_call
        ? `${lastCall} · ${NO_RECENT_CLIENT_CALL_TEXT}`
        : lastCall;
      return `| ${escapeCell(agencyName)} | ${escapeCell(row.client_name)} | ${escapeCell(goalLabel(row.goal))} | ${escapeCell(statusLabel[row.status] || row.status)} | ₪${escapeCell(fmtNumber(row.spend_7d))} | ${escapeCell(outcomes)} | ${escapeCell(efficiencyLabel)} | ${escapeCell(change)} | ${escapeCell(callCell)} | ${escapeCell(snapshotRow?.last_client_call_by)} | ${escapeCell(metaChange)} | ${escapeCell((row.flags || []).join(", ") || "—")} |`;
    }),
  ];
}
