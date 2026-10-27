/** One classified daily row's vote for its campaign's goal. */
export type CampaignGoalVote = {
  key: string;
  goal: string;
  source?: string;
  spend?: number;
};

/**
 * One goal per campaign from its classified daily rows. The strongest signal wins
 * (what the platform says, then a mapping, then the report's type), then the goal
 * backed by the most spend; 'unknown' only when nothing else is known. Rows synced
 * before a campaign's goal was stamped therefore never outvote the stamped rows.
 */
export function resolveCampaignGoals(
  votes: CampaignGoalVote[] = [],
): Map<string, string> {
  const byKey = new Map<string, Record<string, GoalTally>>();
  for (const vote of votes) {
    const goals = byKey.get(vote.key) || {};
    const entry = goals[vote.goal] || { rank: -1, spend: 0 };
    entry.rank = Math.max(entry.rank, GOAL_SOURCE_RANK[vote.source ?? ""] ?? 0);
    entry.spend += (vote.spend || 0) + 1e-6;
    goals[vote.goal] = entry;
    byKey.set(vote.key, goals);
  }
  const result = new Map<string, string>();
  for (const [key, goals] of byKey) {
    const [best] = Object.entries(goals).sort(
      ([goalA, a], [goalB, b]) =>
        unknownLast(goalA) - unknownLast(goalB) ||
        b.rank - a.rank ||
        b.spend - a.spend,
    );
    result.set(key, best[0]);
  }
  return result;
}

type GoalTally = { rank: number; spend: number };

const GOAL_SOURCE_RANK: Record<string, number> = {
  platform_goal: 2,
  explicit_mapping: 1,
  table_report_type: 0,
  unclassified: -1,
};

/** Sort key that puts the 'unknown' goal after every known goal. */
function unknownLast(goal: string): number {
  return goal === "unknown" ? 1 : 0;
}
