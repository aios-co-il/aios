import { ExternalLink } from "lucide-react";
import type { GoogleAdContent } from "@functions/sync-google-ads-data/ad-content.ts";
import { googleAdCardView } from "./googleAdCard";

type Props = {
  content: GoogleAdContent;
};

/**
 * A Google ad drawn as a search result from its stored copy: display URL,
 * headlines and descriptions. Ads that are not search text ads get a note
 * instead of the search look, with their copy listed below it.
 */
export function GoogleAdCard({ content }: Props) {
  const view = googleAdCardView(content);

  return (
    <div className="space-y-3">
      {!view.isTextAd && (
        <p className="text-sm text-muted-foreground">
          אין תצוגה מקדימה לסוג מודעה זה
        </p>
      )}
      <div className="space-y-1 rounded-lg border bg-background p-4" dir="auto">
        {view.isTextAd && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">ממומן</span>
            {view.displayUrl && (
              <span className="ms-2" dir="ltr">
                {view.displayUrl}
              </span>
            )}
          </p>
        )}
        {view.headline && (
          <p className="text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
            {view.headline}
          </p>
        )}
        {view.descriptions.map((description, index) => (
          <p
            key={`${index}:${description}`}
            className="text-sm text-muted-foreground"
          >
            {description}
          </p>
        ))}
      </div>
      {view.landingHref && (
        <a
          href={view.landingHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          פתיחת דף הנחיתה
        </a>
      )}
    </div>
  );
}
