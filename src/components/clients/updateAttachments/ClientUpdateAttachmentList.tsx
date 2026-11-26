import { useState } from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatAttachmentSize,
  isPictureType,
  type ClientUpdateAttachment,
} from "./attachmentRules";
import {
  signAttachmentOpenUrl,
  signAttachmentPreviews,
} from "./clientUpdateAttachments";

/** Preview links live 10 minutes; refresh them well before that. */
const PREVIEW_STALE_MS = 5 * 60 * 1000;

/**
 * An entry's files: pictures as thumbnails that open larger in a dialog,
 * documents as their name, opened or downloaded through a one-minute link.
 */
export function ClientUpdateAttachmentList({
  attachments,
}: {
  attachments: Array<ClientUpdateAttachment> | null | undefined;
}) {
  const [viewing, setViewing] = useState<ClientUpdateAttachment | null>(null);
  const [brokenPreviews, setBrokenPreviews] = useState<Array<string>>([]);
  const list = attachments ?? [];
  const picturePaths = list
    .filter((attachment) => isPictureType(attachment.mime_type))
    .map((attachment) => attachment.storage_path);
  const { data: previews } = useQuery({
    queryKey: ["client-update-attachment-previews", ...picturePaths],
    queryFn: picturePaths.length
      ? () => signAttachmentPreviews(picturePaths)
      : skipToken,
    staleTime: PREVIEW_STALE_MS,
  });

  if (!list.length) {
    return null;
  }

  /** A picture whose preview link is signed and loaded; others show by name. */
  function isThumbnail(attachment: ClientUpdateAttachment): boolean {
    return (
      isPictureType(attachment.mime_type) &&
      !!previews?.[attachment.storage_path] &&
      !brokenPreviews.includes(attachment.storage_path)
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {list.map((attachment) =>
        isThumbnail(attachment) ? (
          <button
            key={attachment.id}
            type="button"
            onClick={() => setViewing(attachment)}
            className="block overflow-hidden rounded-md border border-border/60"
            aria-label={`הצג את ${attachment.file_name}`}
          >
            <img
              src={previews?.[attachment.storage_path]}
              alt={attachment.file_name}
              loading="lazy"
              className="h-20 w-20 object-cover"
              onError={() =>
                setBrokenPreviews((paths) => [
                  ...paths,
                  attachment.storage_path,
                ])
              }
            />
          </button>
        ) : (
          <button
            key={attachment.id}
            type="button"
            onClick={() => void openAttachment(attachment)}
            className="flex max-w-[14rem] items-center gap-1.5 rounded-md border border-border/60 bg-card px-2 py-1.5 text-xs hover:bg-muted"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{attachment.file_name}</span>
            <span className="shrink-0 text-muted-foreground">
              {formatAttachmentSize(attachment.size_bytes)}
            </span>
          </button>
        ),
      )}
      <Dialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
      >
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="truncate">{viewing?.file_name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <>
              <img
                src={previews?.[viewing.storage_path]}
                alt={viewing.file_name}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
              <Button
                type="button"
                variant="outline"
                className="gap-1.5 self-start"
                onClick={() => void openAttachment(viewing)}
              >
                <Download className="h-4 w-4" />
                הורדה
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Opens a file through a fresh one-minute link, or says it could not. */
async function openAttachment(attachment: ClientUpdateAttachment) {
  try {
    const url = await signAttachmentOpenUrl(attachment);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("client update attachment open failed:", error);
    toast.error(`לא הצלחנו לפתוח את "${attachment.file_name}"`);
  }
}
