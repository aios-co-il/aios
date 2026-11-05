import { Globe } from "lucide-react";
import { Card } from "@/components/ui/card";
import { GoogleAdsCampaignTable } from "../GoogleAdsCampaignSection/GoogleAdsCampaignTable";
import { googleStoreTotals } from "../GoogleAdsCampaignSection/googleAdsTotals";
import type {
  GoogleAdsCampaignSummaryRow,
  GoogleAdsFormatters,
} from "../GoogleAdsCampaignSection/types";
import { ContinentOverview } from "./ContinentOverview";
import { continentSections, type ContinentSection } from "./continentSections";

type Props = GoogleAdsFormatters & {
  /** The Google Ads campaigns of the period (summarizeGoogleAdsCampaigns). */
  campaigns: Array<GoogleAdsCampaignSummaryRow>;
};

/**
 * The "לפי יבשות" tab: a summary row per continent, then each continent's
 * campaigns in a table of their own, so one destination region reads apart
 * from the rest.
 */
export function CampaignContinentsTab({ campaigns, ...formats }: Props) {
  const sections = continentSections(campaigns);
  if (sections.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">
          אין נתוני Google Ads בטווח התאריכים הנבחר
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <ContinentOverview sections={sections} {...formats} />
      {sections.map((section) => (
        <ContinentTables
          key={section.continent}
          section={section}
          {...formats}
        />
      ))}
    </div>
  );
}

/** One continent's campaigns: one table, or one per goal when it has both. */
function ContinentTables({
  section,
  ...formats
}: GoogleAdsFormatters & { section: ContinentSection }) {
  const ecommerce = section.campaigns.filter((c) => c.goal === "ecommerce");
  const leads = section.campaigns.filter((c) => c.goal !== "ecommerce");
  const mixed = ecommerce.length > 0 && leads.length > 0;
  const store = googleStoreTotals(section.ecommerce);
  const icon = <Globe className="h-5 w-5 text-sky-600" />;
  const shared = { store, mixed, icon, ...formats };
  return (
    <div id={`continent-${section.continent}`} className="space-y-4">
      {ecommerce.length > 0 && (
        <GoogleAdsCampaignTable
          rows={ecommerce}
          goal="ecommerce"
          groupTotals={section.ecommerce}
          title={mixed ? `${section.title} - מכירות` : section.title}
          {...shared}
        />
      )}
      {leads.length > 0 && (
        <GoogleAdsCampaignTable
          rows={leads}
          goal="leads"
          groupTotals={section.leads}
          title={mixed ? `${section.title} - לידים` : section.title}
          {...shared}
        />
      )}
    </div>
  );
}
