import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdPreviewSource } from "./AdPreviewContext";
import { useAdPreview } from "./useAdPreview";

type Props = {
  source: AdPreviewSource;
  /** The ad shown; null while the dialog is closed. */
  adId: string | null;
  adName: string;
  onClose: () => void;
};

/**
 * Meta's mobile feed preview of one ad, framed from Meta's own preview page.
 * The same dialog opens from the internal report and its share link.
 */
export function AdPreviewDialog({ source, adId, adName, onClose }: Props) {
  const preview = useAdPreview(source, adId);
  return (
    <Dialog open={adId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="truncate" title={adName}>
            {adName}
          </DialogTitle>
          <DialogDescription>
            תצוגה מקדימה של המודעה בפיד במובייל
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[32rem] items-center justify-center">
          {preview.isPending && (
            <Loader2
              className="h-6 w-6 animate-spin text-muted-foreground"
              aria-label="טוען תצוגה מקדימה"
            />
          )}
          {preview.isError && (
            <p className="text-sm text-muted-foreground">
              לא ניתן לטעון את התצוגה המקדימה של המודעה כרגע.
            </p>
          )}
          {preview.data && (
            <iframe
              src={preview.data}
              title={`תצוגה מקדימה: ${adName}`}
              sandbox="allow-scripts allow-same-origin allow-popups"
              className="h-[32rem] w-full max-w-[22rem] border-0"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
