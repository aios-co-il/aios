import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CampaignOffTable } from "@/lib/campaignOffState";
import type { DashboardFacebookCampaigns } from "@/lib/dashboardCampaignGoals";
import type { FacebookTabFormatters } from "@/components/FacebookReportTab/facebookColumns";
import type { FacebookTabRecord } from "@/components/FacebookReportTab/facebookTabFigures";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
} from "../GoogleAdsCampaignSection/types";
import { CampaignContinentsTab } from "./CampaignContinentsTab";
import { CombinedContinentsTab } from "./CombinedContinentsTab";
import { FacebookContinentsTab } from "./FacebookContinentsTab";

type ContinentsPlatform = "combined" | "facebook" | "google";

type Props = {
  /** Meta's campaigns, or null when their names do not name destinations. */
  facebook:
    | (FacebookTabFormatters & {
        campaigns: DashboardFacebookCampaigns;
        records: Array<FacebookTabRecord>;
        tables: Array<CampaignOffTable>;
      })
    | null;
  /** Google's campaigns, or null when their names do not name destinations. */
  google:
    | (GoogleAdsFormatters & { campaigns: Array<GoogleAdsCampaignSummaryRow> })
    | null;
};

/**
 * The dashboard's "לפי יבשות" tab: a view per platform whose campaigns name
 * destinations, and a combined one when both do, opened first.
 */
export function DashboardContinentsView({ facebook, google }: Props) {
  const platforms = availablePlatforms(facebook !== null, google !== null);
  const [picked, setPicked] = useState<ContinentsPlatform>(platforms[0]);
  const shown = platforms.includes(picked) ? picked : platforms[0];
  return (
    <div className="space-y-4">
      {platforms.length > 1 && (
        <Tabs
          value={shown}
          onValueChange={(value) => setPicked(value as ContinentsPlatform)}
        >
          <TabsList dir="rtl">
            {platforms.map((platform) => (
              <TabsTrigger key={platform} value={platform}>
                {PLATFORM_LABELS[platform]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {shown === "combined" && facebook && google && (
        <CombinedContinentsTab facebook={facebook} google={google} />
      )}
      {shown === "facebook" && facebook && (
        <FacebookContinentsTab {...facebook} />
      )}
      {shown === "google" && google && <CampaignContinentsTab {...google} />}
    </div>
  );
}

const PLATFORM_LABELS: Record<ContinentsPlatform, string> = {
  combined: "משולב",
  facebook: "Facebook",
  google: "Google Ads",
};

/** The views the platforms earn: combined first when both do. */
function availablePlatforms(
  facebook: boolean,
  google: boolean,
): Array<ContinentsPlatform> {
  return [
    ...(facebook && google ? (["combined"] as const) : []),
    ...(facebook ? (["facebook"] as const) : []),
    ...(google ? (["google"] as const) : []),
  ];
}
