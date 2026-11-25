import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  /** The ad's name. */
  adName: string;
  /** What the preview shows, under the name. */
  description: string;
  onClose: () => void;
  /** The platform's preview; mounted only while the dialog is open. */
  children: ReactNode;
};

/**
 * The one dialog an ad's preview opens in, on the internal report and its
 * share link: Meta's preview frame for a Facebook ad, the drawn card for a
 * Google ad.
 */
export function AdPreviewDialog({
  open,
  adName,
  description,
  onClose,
  children,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="truncate" title={adName}>
            {adName}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
