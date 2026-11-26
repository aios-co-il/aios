import type { GoogleAdContent } from "@functions/sync-google-ads-data/ad-content.ts";
import { GoogleAdCard } from "./GoogleAdCard";
import { PreviewableNameCell } from "./PreviewableNameCell";

type Props = {
  name: string;
  /** Paused, removed or its report switched off. */
  off: boolean;
  /** The ad's stored copy; null for other rows and ads synced before it was stored. */
  adContent?: GoogleAdContent | null;
};

/**
 * The name cell of a Google Ads report row. An ad row with stored copy opens
 * its card, drawn from the row with no request, so it works the same on the
 * internal report and its share link; every other row is the plain name cell.
 */
export function GoogleEntityNameCell({ name, off, adContent }: Props) {
  return (
    <PreviewableNameCell
      name={name}
      off={off}
      description="תצוגה מקדימה של המודעה בחיפוש Google"
      preview={adContent ? <GoogleAdCard content={adContent} /> : null}
    />
  );
}
