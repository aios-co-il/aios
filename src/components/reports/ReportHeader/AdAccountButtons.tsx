import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type AdAccountShortcut,
  adAccountShortcutLabel,
} from "@/lib/adAccountUrl";

/**
 * The "open ad account" buttons of a report or dashboard header, one per
 * account, in a new tab. The signed-in pages and the share links show the
 * same buttons; a share link gets its links built by the server.
 */
export function AdAccountButtons({
  links,
}: {
  links: Array<AdAccountShortcut> | null | undefined;
}) {
  if (!links?.length) {
    return null;
  }
  return (
    <>
      {links.map((link) => (
        <Button
          key={link.url}
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-4 w-4" />
          {adAccountShortcutLabel(link, links.length)}
        </Button>
      ))}
    </>
  );
}
