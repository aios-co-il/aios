import { FOLLOWER_COLUMN_LABELS } from "@/lib/facebookFollowers";
import type { PulseCampaignGoalRow } from "@/lib/pulseCampaignGoals";

type Props = {
  row: Pick<
    PulseCampaignGoalRow,
    "outcome_kind" | "clicks_7d" | "ctr_7d" | "new_followers_7d"
  >;
  formatNumber: (value: number) => string;
};

/**
 * Clicks, CTR and new followers of a traffic or engagement campaign in the
 * pulse check, beside its impressions. Clicks are left out when they already
 * are the campaign's outcome, and followers until a synced row counts them.
 */
export function PulseTrafficMetrics({ row, formatNumber }: Props) {
  const clicksAreOutcome =
    row.outcome_kind === "link_clicks" || row.outcome_kind === "clicks";
  return (
    <>
      {!clicksAreOutcome && (
        <div>
          <span className="text-muted-foreground">קליקים: </span>
          <strong>{formatNumber(row.clicks_7d)}</strong>
        </div>
      )}
      <div>
        <span className="text-muted-foreground">CTR: </span>
        <strong>{row.ctr_7d === null ? "—" : `${row.ctr_7d}%`}</strong>
      </div>
      {row.new_followers_7d !== null && (
        <div>
          <span className="text-muted-foreground">
            {FOLLOWER_COLUMN_LABELS.newFollowers}:{" "}
          </span>
          <strong>{formatNumber(row.new_followers_7d)}</strong>
        </div>
      )}
    </>
  );
}
