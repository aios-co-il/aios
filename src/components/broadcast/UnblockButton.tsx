import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { BlacklistEntry } from "@/hooks/useBroadcastBlacklist";

/** Owner-only unblock with a confirmation; warns when the contact unsubscribed themselves. */
export function UnblockButton({
  entry,
  disabled,
  onConfirm,
}: {
  entry: BlacklistEntry;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const selfUnsubscribed =
    entry.source === "unsubscribe_link" || entry.source === "email_unsubscribe";
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          title="הסר חסימה"
          disabled={disabled}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>להסיר את החסימה?</AlertDialogTitle>
          <AlertDialogDescription>
            {selfUnsubscribed
              ? "הנמען ביקש בעצמו להסיר אותו מהדיוור. לאחר ביטול החסימה הוא יקבל שוב דיוורים – בטוח?"
              : "לאחר ביטול החסימה איש הקשר יקבל שוב דיוורים."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>ביטול</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>הסר חסימה</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
