import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignContinentsTab } from "./CampaignContinentsTab";
import { CombinedContinentsTab } from "./CombinedContinentsTab";
import type {
  ContinentPlatforms,
  FacebookContinentsInput,
  GoogleContinentsInput,
} from "./continentInputs";
import { FacebookContinentsTab } from "./FacebookContinentsTab";

type ContinentsView = "combined" | "facebook" | "google";

type Props = {
  /** Which platforms' campaign names name destinations (continentPlatforms). */
  platforms: ContinentPlatforms;
  facebook: FacebookContinentsInput;
  google: GoogleContinentsInput;
};

const VIEW_LABELS: Record<ContinentsView, string> = {
  combined: "משולב",
  facebook: "Facebook",
  google: "Google Ads",
};

/**
 * The dashboard's "לפי יבשות" tab: a view per platform whose campaigns name
 * destinations, and a combined one, opened first, when both do. A dashboard
 * where only Google qualifies sees Google's view alone, as before.
 */
export function DashboardContinentsView({
  platforms,
  facebook,
  google,
}: Props) {
  const views = availableViews(platforms);
  const [picked, setPicked] = useState<ContinentsView>(views[0]);
  const shown = views.includes(picked) ? picked : views[0];
  return (
    <div className="space-y-4">
      {views.length > 1 && (
        <Tabs
          value={shown}
          onValueChange={(value) => {
            const view = views.find((candidate) => candidate === value);
            if (view) {
              setPicked(view);
            }
          }}
        >
          <TabsList dir="rtl">
            {views.map((view) => (
              <TabsTrigger key={view} value={view}>
                {VIEW_LABELS[view]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {shown === "combined" && (
        <CombinedContinentsTab facebook={facebook} google={google} />
      )}
      {shown === "facebook" && <FacebookContinentsTab {...facebook} />}
      {shown === "google" && <CampaignContinentsTab {...google} />}
    </div>
  );
}

/** The views the platforms earn: combined first when both do. */
function availableViews({
  facebook,
  google,
}: ContinentPlatforms): Array<ContinentsView> {
  return [
    ...(facebook && google ? (["combined"] as const) : []),
    ...(facebook ? (["facebook"] as const) : []),
    ...(google ? (["google"] as const) : []),
  ];
}
