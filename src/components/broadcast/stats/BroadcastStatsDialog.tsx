import { useState } from "react";
import type { Broadcast } from "@/hooks/useBroadcasts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import {
  RECIPIENT_FILTERS,
  matchesFilter,
  type RecipientFilter,
} from "./broadcastStats";
import { RecipientsTable } from "./RecipientsTable";
import { StatsTiles } from "./StatsTiles";
import { useBroadcastRecipients } from "./useBroadcastRecipients";

/** Per-broadcast stats: rates per stage and who opened / clicked / failed. */
export function BroadcastStatsDialog({
  broadcast,
  onClose,
}: {
  broadcast: Broadcast;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<RecipientFilter>("all");
  const { data: rows = [], isLoading } = useBroadcastRecipients(broadcast.id);
  const isEmail = broadcast.channel === "email";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>סטטיסטיקות · {broadcast.name}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <StatsTiles rows={rows} isEmail={isEmail} />
            {isEmail && (
              <>
                <p className="text-xs text-muted-foreground">
                  שיעור פתיחה והקלקה מחושבים מתוך המיילים שנמסרו. פתיחה נמדדת
                  לפי טעינת תמונות, ולכן חלק מתוכנות המייל לא מדווחות עליה.
                </p>
                <div className="flex flex-wrap gap-1 text-xs">
                  {RECIPIENT_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={`rounded border px-2 py-1 ${filter === f.key ? "bg-primary text-primary-foreground" : ""}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            <RecipientsTable
              rows={rows.filter((r) => matchesFilter(r, filter))}
              isEmail={isEmail}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
