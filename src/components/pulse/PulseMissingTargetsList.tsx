import { Facebook, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPulseMoney, goalLabel } from "@/lib/pulseDashboard";
import type {
  PulseCampaignGoal,
  PulseCampaignGoalRow,
} from "@/lib/pulseCampaignGoals";
import {
  pulsePlatformName,
  type PulsePlatform,
} from "../../../supabase/functions/_shared/pulse/platforms.ts";
import { isPulseTargetGoal } from "../../../supabase/functions/_shared/pulse/targets/kinds.ts";
import type { PlatformWithoutTarget } from "../../../supabase/functions/_shared/pulse/targets/missing.ts";

type ClientMeta = { name: string; campaignerName: string };

type PulseMissingTargetsListProps = {
  groups: PlatformWithoutTarget<PulseCampaignGoalRow>[];
  clientMetaById: Map<string, ClientMeta>;
  onOpenClient: (clientId: string) => void;
  onSetTargets: (
    clientId: string,
    platform: PulsePlatform,
    goal: PulseCampaignGoal,
  ) => void;
};

const MAX_CAMPAIGNS_SHOWN = 4;

/**
 * "לקוחות בלי יעד": clients × platforms whose spending lead or ecommerce campaigns
 * have no target of any source, biggest spend first, each with a shortcut to the
 * target editor.
 */
export function PulseMissingTargetsList({
  groups,
  clientMetaById,
  onOpenClient,
  onSetTargets,
}: PulseMissingTargetsListProps) {
  const visible = groups.flatMap((group) => {
    const meta = clientMetaById.get(group.client_id);
    return meta ? [{ group, meta }] : [];
  });
  if (visible.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        לכל הקמפיינים עם הוצאה בטווח ובסינון שנבחרו יש יעד
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map(({ group, meta }) => {
        const shown = group.campaigns.slice(0, MAX_CAMPAIGNS_SHOWN);
        const hidden = group.campaigns.length - shown.length;
        return (
          <Card key={`${group.client_id}:${group.platform}`}>
            <CardContent className="p-3 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline text-right"
                    onClick={() => onOpenClient(group.client_id)}
                  >
                    {meta.name}
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <span>{meta.campaignerName}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      {group.platform === "meta" ? (
                        <Facebook className="h-3.5 w-3.5 text-blue-600" />
                      ) : null}
                      {pulsePlatformName(group.platform)}
                    </span>
                    <span>·</span>
                    <span>הוצאה 7 ימים {formatPulseMoney(group.spend_7d)}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() =>
                    onSetTargets(
                      group.client_id,
                      group.platform,
                      dominantGoal(group),
                    )
                  }
                >
                  <Target className="h-3.5 w-3.5" />
                  קבע יעדים
                </Button>
              </div>
              <ul className="space-y-1 text-xs">
                {shown.map((campaign) => (
                  <li
                    key={campaign.campaign_key}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="min-w-0 break-words">
                      {campaign.campaign_name}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {isPulseTargetGoal(campaign.goal) ? (
                        <Badge variant="outline" className="text-[10px]">
                          {goalLabel(campaign.goal)}
                        </Badge>
                      ) : null}
                      {formatPulseMoney(campaign.spend_7d)}
                    </span>
                  </li>
                ))}
                {hidden > 0 ? (
                  <li className="text-muted-foreground">
                    ועוד {hidden} קמפיינים
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** The goal with the most spend among a group's campaigns without a target. */
function dominantGoal(
  group: PlatformWithoutTarget<PulseCampaignGoalRow>,
): PulseCampaignGoal {
  const spendByGoal = new Map<PulseCampaignGoal, number>();
  for (const campaign of group.campaigns) {
    spendByGoal.set(
      campaign.goal,
      (spendByGoal.get(campaign.goal) ?? 0) + campaign.spend_7d,
    );
  }
  return (
    [...spendByGoal.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "leads"
  );
}
