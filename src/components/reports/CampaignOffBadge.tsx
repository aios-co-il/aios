import { Badge } from "@/components/ui/badge";

/**
 * "כבוי" before the name of a report row whose campaign is paused, removed or
 * switched off; such a row only shows when it spent in the period
 * (`showCampaignRow`). It goes first so a truncated name cell still shows it.
 */
export function CampaignOffBadge({ off }: { off: boolean }) {
  if (!off) {
    return null;
  }
  return (
    <Badge
      variant="secondary"
      className="ml-2 align-middle text-[10px] font-normal"
      title="הקמפיין כבוי — מוצג כי הוציא כסף בתקופת הדוח"
    >
      כבוי
    </Badge>
  );
}
