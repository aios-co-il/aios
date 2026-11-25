import { AdsCampaignPicker } from "@/components/reports/AdsCampaignFilter/AdsCampaignPicker";
import type { AdsCampaignFilterControl } from "@/components/reports/AdsCampaignFilter/useAdsCampaignFilter";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ADS_ENTITY_LEVEL_LABELS,
  ADS_ENTITY_LEVELS,
  type AdsEntityLevel,
} from "@/lib/adsEntityLevel";

interface AdsEntityLevelTabsProps {
  value: AdsEntityLevel;
  onChange: (level: AdsEntityLevel) => void;
  className?: string;
  /** The campaign pick, shown beside the tabs on the ad set and ad levels. */
  campaignFilter?: AdsCampaignFilterControl;
}

/** The report's campaign / ad set / ad tabs, with the campaign picker. */
export function AdsEntityLevelTabs({
  value,
  onChange,
  className,
  campaignFilter,
}: AdsEntityLevelTabsProps) {
  return (
    <div dir="rtl" className="w-full flex flex-wrap items-center gap-2">
      <Tabs
        value={value}
        onValueChange={(next) => onChange(next as AdsEntityLevel)}
        className={className}
        dir="rtl"
      >
        <TabsList className="h-auto inline-flex justify-start gap-1 bg-muted/40 p-1 flex-wrap">
          {ADS_ENTITY_LEVELS.map((level) => (
            <TabsTrigger
              key={level}
              value={level}
              className="rounded-md px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              {ADS_ENTITY_LEVEL_LABELS[level]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {campaignFilter && value !== "campaign" && (
        <AdsCampaignPicker {...campaignFilter} />
      )}
    </div>
  );
}
