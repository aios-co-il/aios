/** A campaign row of one client × platform, as buildPulseCampaignRows classified it. */
export type EfficiencyCampaignRow = {
  campaign_name?: string | null;
  status?: string | null;
  status_tier?: string | null;
  status_reason?: string | null;
  alert_eligible?: boolean | null;
  spend_7d?: number | null;
};

/** The attention matrix's efficiency cell: red (alert) or yellow (watch). */
export type EfficiencyIssue = { level: "alert" | "watch"; label: string };

/**
 * The efficiency cell of a client × platform, taken from its campaign rows. Each
 * row was classified by buildPulseCampaignRows with the tenant's cost rules, the
 * same classification the snapshot stores and alerts on, so the dashboard turns
 * red exactly when a WhatsApp alert is due (alert_eligible). An exception that
 * does not alert (a campaign without a target while those alerts are off) shows
 * as watch.
 */
export function evaluateEfficiencyIssue({
  campaignRows = [],
}: { campaignRows?: EfficiencyCampaignRow[] } = {}): EfficiencyIssue | null {
  const flagged = campaignRows
    .filter(
      (row) =>
        // An exception is red when it alerts and yellow while its alerts are off.
        row.status_tier === "exception" ||
        (row.status === "warning" && row.status_tier === "watch"),
    )
    .sort(
      (a, b) =>
        Number(b.alert_eligible === true) - Number(a.alert_eligible === true) ||
        tierRank(b.status_tier) - tierRank(a.status_tier) ||
        (b.spend_7d ?? 0) - (a.spend_7d ?? 0),
    );
  if (!flagged.length) {
    return null;
  }
  const worst = flagged[0];
  const name = worst.campaign_name ? `${worst.campaign_name}: ` : "";
  const silentException =
    worst.status_tier === "exception" && worst.alert_eligible !== true;
  const silent = silentException
    ? " · בלי התראה (התראות לקמפיינים בלי יעד כבויות)"
    : "";
  return {
    level: worst.alert_eligible === true ? "alert" : "watch",
    label: `${name}${worst.status_reason || "חריגה"}${silent}${moreCampaigns(flagged.length - 1)}`,
  };
}

/** An exception outranks a watch. */
function tierRank(tier: string | null | undefined): number {
  if (tier === "exception") {
    return 2;
  }
  return tier === "watch" ? 1 : 0;
}

/** " (ועוד …)" for the other flagged campaigns of the cell. */
function moreCampaigns(others: number): string {
  if (others === 1) {
    return " (ועוד קמפיין אחד)";
  }
  return others > 1 ? ` (ועוד ${others} קמפיינים)` : "";
}
