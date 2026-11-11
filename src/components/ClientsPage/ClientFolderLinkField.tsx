import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ClientRow } from "./clientRow";
import type { ClientRowMutations } from "./useClientRowMutations";

/**
 * The folder link of a row as an inline field: "שמור" appears once the text
 * differs from the saved link, and the open button once a link is saved.
 */
export function ClientFolderLinkField({
  client,
  mutations,
  dense = false,
}: {
  client: ClientRow;
  mutations: ClientRowMutations;
  /** The table's shorter 32px controls. */
  dense?: boolean;
}) {
  const { folderLinkDraft, setFolderLinkDraft, updateFolderLink } = mutations;
  const saved = client.folder_link || "";
  const draft =
    folderLinkDraft?.clientId === client.id ? folderLinkDraft.link : null;
  const height = dense ? "h-8" : "h-9";
  return (
    <div className="flex gap-2">
      <Input
        type="text"
        placeholder={dense ? "קישור לתיקיה..." : "הזן קישור לתיקיה..."}
        value={draft ?? saved}
        onChange={(e) =>
          setFolderLinkDraft({ clientId: client.id, link: e.target.value })
        }
        className={cn(height, "text-sm")}
      />
      {draft !== null && draft !== saved && (
        <Button
          size="sm"
          className={height}
          onClick={() =>
            updateFolderLink.mutate({ clientId: client.id, link: draft })
          }
          disabled={updateFolderLink.isPending}
        >
          שמור
        </Button>
      )}
      {client.folder_link && (
        <Button
          size="sm"
          variant="outline"
          className={cn(height, "w-9 shrink-0 p-0", dense && "w-8")}
          onClick={() => window.open(client.folder_link ?? "", "_blank")}
          title="פתח תיקיה"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
