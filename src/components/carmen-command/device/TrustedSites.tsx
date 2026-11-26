import { X } from "lucide-react";
import { useTrustedSites } from "./useTrustedSites";

/**
 * The sites the user trusted for this conversation in the extension's panel, where clicks
 * and typing run without a card, each with a button that ends the trust (AIO-656). Shown
 * only beside the panel, and only while the conversation trusts a site.
 */
export function TrustedSites({
  conversationId,
  active,
  waiting,
}: {
  conversationId: string | null;
  active: boolean;
  waiting: boolean;
}) {
  const { sites, revoke } = useTrustedSites(conversationId, active, waiting);
  if (sites.length === 0) {
    return null;
  }

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[var(--cc-line)] px-3 py-1.5 text-xs text-[var(--cc-text-dim)]"
      role="status"
    >
      <span>אתרים שכרמן פועלת בהם בלי לשאול בשיחה הזו:</span>
      {sites.map((site) => {
        const host = new URL(site.origin).host;
        return (
          <span
            key={site.id}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--cc-line)] px-2 py-0.5"
            dir="ltr"
          >
            {host}
            <button
              type="button"
              className="rounded-full hover:text-[var(--cc-text)]"
              aria-label={`להפסיק לסמוך על ${host}`}
              title={`להפסיק לסמוך על ${host}`}
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(site.id)}
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        );
      })}
    </div>
  );
}
