import { CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isEditablePage } from "./pageEdit";
import type { WorkshopArtifact } from "./workshopFeedModel";

/**
 * A concept or script page's own buttons: edit it by hand, and approve a concept (the chat sends
 * "קונספט: <name>", which the server saves as the brief's concept). The script is approved only
 * with the button under it in the chat, so it has no second approval here.
 */
export function PageActions({
  artifact,
  onEdit,
  onApproveConcept,
}: {
  artifact: WorkshopArtifact;
  onEdit: () => void;
  onApproveConcept: () => void;
}) {
  if (!isEditablePage(artifact)) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1 rounded-full px-3 text-xs"
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      >
        <Pencil className="h-3 w-3" />
        עריכה
      </Button>
      {artifact.kind === "concept" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 rounded-full px-3 text-xs"
          onClick={(event) => {
            event.stopPropagation();
            onApproveConcept();
          }}
        >
          <CheckCircle2 className="h-3 w-3" />
          אישור הקונספט
        </Button>
      ) : null}
    </div>
  );
}
