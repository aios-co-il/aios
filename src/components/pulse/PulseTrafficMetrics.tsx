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
 * A snapshot stored before these metrics existed shows none of them.
 */
export function PulseTrafficMetrics({ row, formatNumber }: Props) {
  if (row.clicks_7d === undefined) {
    return null;
  }
  const ctr = row.ctr_7d ?? null;
  const newFollowers = row.new_followers_7d ?? null;
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
        <strong>{ctr === null ? "—" : `${ctr}%`}</strong>
      </div>
      {newFollowers !== null && (
        <div>
          <span className="text-muted-foreground">
            {FOLLOWER_COLUMN_LABELS.newFollowers}:{" "}
          </span>
          <strong>{formatNumber(newFollowers)}</strong>
        </div>
      )}
    </>
  );
}
