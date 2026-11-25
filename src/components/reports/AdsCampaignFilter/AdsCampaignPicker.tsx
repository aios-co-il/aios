import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdsCampaignFilterControl } from "./useAdsCampaignFilter";

// Radix Select items cannot hold an empty value; campaign keys are ids or names.
const ALL_CAMPAIGNS = "__all_campaigns__";

/**
 * Narrows the ad set and ad tabs to one campaign. Shown only when there is
 * more than one campaign to choose from.
 */
export function AdsCampaignPicker({
  campaigns,
  value,
  onChange,
}: AdsCampaignFilterControl) {
  if (campaigns.length < 2) {
    return null;
  }
  return (
    <Select
      value={value ?? ALL_CAMPAIGNS}
      onValueChange={(next) => onChange(next === ALL_CAMPAIGNS ? null : next)}
      dir="rtl"
    >
      <SelectTrigger
        aria-label="סינון לפי קמפיין"
        className="h-9 w-auto min-w-[12rem] max-w-xs bg-background"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_CAMPAIGNS}>כל הקמפיינים</SelectItem>
        {campaigns.map((campaign) => (
          <SelectItem key={campaign.key} value={campaign.key}>
            {campaign.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
