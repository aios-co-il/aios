import { ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollapsibleTrigger } from "@/components/ui/collapsible";
import { landingPageUrl, type LandingSettings } from "./landingSettings";

/** The settings panel's title, which opens and closes it, and the live page's address. */
export function LandingSettingsHeader({
  expanded,
  saved,
}: {
  expanded: boolean;
  saved: LandingSettings;
}) {
  const pageUrl = saved.pageExists
    ? landingPageUrl(saved.subdomain, saved.slug)
    : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ms-2 gap-1 px-2 text-sm font-semibold"
          aria-label={
            expanded ? "הסתרת הגדרות עמוד נחיתה" : "הצגת הגדרות עמוד נחיתה"
          }
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "" : "rotate-90"}`}
          />
          <h2>הגדרות עמוד נחיתה</h2>
        </Button>
      </CollapsibleTrigger>
      {pageUrl ? (
        <a
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
          dir="ltr"
          className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        >
          {pageUrl.replace("https://", "")}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}
