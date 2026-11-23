import type { UseMutationResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useIsManagerOwner } from "../pulse/manager-round/useIsManagerOwner";
import { CardDraftItem } from "./CardDraftItem";
import { CardDraftsToolbar } from "./CardDraftsToolbar";
import {
  approveFeedback,
  dismissFeedback,
  type DraftFeedback,
} from "./draftFeedback";
import { useApproveCardDrafts } from "./useApproveCardDrafts";
import { useCardDrafts } from "./useCardDrafts";
import { useDismissCardDrafts } from "./useDismissCardDrafts";
import { useDraftSelection } from "./useDraftSelection";

/**
 * Client-card drafts waiting for approval (card_stale_group findings), opened
 * from the morning brief's link: check drafts, then approve or dismiss them
 * together instead of replying to Carmen once per draft.
 */
export function CardDraftsPage() {
  const { tenantId } = useCurrentTenant();
  const { data: drafts, isLoading, isError } = useCardDrafts(tenantId);
  const ids = useMemo(() => drafts?.map((draft) => draft.id) ?? [], [drafts]);
  const selection = useDraftSelection(ids);
  const approve = useApproveCardDrafts(tenantId);
  const dismiss = useDismissCardDrafts(tenantId);
  const isOwner = useIsManagerOwner(tenantId).data === true;
  const busy = approve.isPending || dismiss.isPending;

  /** Runs `action` on the checked drafts, then reports each outcome. */
  function act<Result>(
    action: UseMutationResult<Result, Error, Array<string>>,
    feedback: (result: Result) => DraftFeedback,
  ) {
    action.mutate(selection.selected, {
      onSuccess: (result) => {
        showFeedback(feedback(result));
        selection.clear();
      },
      onError: (error) => toast.error(error.message),
    });
  }

  return (
    <div dir="rtl" className="mx-auto max-w-2xl space-y-3 px-4 py-4">
      <h1 className="text-lg font-semibold">עדכונים לכרטיסי לקוחות</h1>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">טוען עדכונים…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">לא הצלחנו לטעון את העדכונים.</p>
      ) : !drafts?.length ? (
        <p className="text-sm text-muted-foreground">
          אין עדכונים שמחכים לאישור
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <CardDraftItem
                  draft={draft}
                  checked={selection.isSelected(draft.id)}
                  onToggle={selection.toggle}
                />
              </li>
            ))}
          </ul>
          <CardDraftsToolbar
            selectedCount={selection.selected.length}
            allSelected={selection.allSelected}
            busy={busy}
            canDismiss={isOwner}
            onToggleAll={selection.toggleAll}
            onApprove={() => act(approve, approveFeedback)}
            onDismiss={() => act(dismiss, dismissFeedback)}
          />
        </>
      )}
    </div>
  );
}

/** One toast for what went through and one for what did not. */
function showFeedback({ done, failed }: DraftFeedback) {
  if (done) {
    toast.success(done);
  }
  if (failed) {
    toast.error(failed);
  }
}
