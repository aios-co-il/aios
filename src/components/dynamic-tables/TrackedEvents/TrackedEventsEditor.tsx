import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { completeRatio, type EditorRow, editorRows } from "./editorRows";
import { type RatioDraft, RatioPicker } from "./RatioPicker";
import type { TrackedRatio } from "./siteKpis";
import type { TrackedEvent } from "./trackedEvents";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The events the dashboard follows now, in funnel order. */
  current: Array<TrackedEvent>;
  /** Every GA event of the period, most frequent first. */
  available: Array<{ event: string; count: number }>;
  /** The conversion pair the dashboard shows now, if any. */
  currentRatio: TrackedRatio | null;
  onSave: (
    events: Array<TrackedEvent>,
    ratio: TrackedRatio | null,
  ) => Promise<void>;
  saving: boolean;
};

/**
 * Picks which GA events the dashboard follows, their Hebrew labels and their
 * funnel order. Followed events come first, in order; the rest of the
 * period's events follow, most frequent first.
 */
export function TrackedEventsEditor({
  open,
  onOpenChange,
  current,
  available,
  currentRatio,
  onSave,
  saving,
}: Props) {
  const [rows, setRows] = useState(() => editorRows(current, available));
  const [ratio, setRatio] = useState<RatioDraft>(currentRatio ?? {});
  const chosen = rows
    .filter((row) => row.on)
    .map((row) => ({ event: row.event, label: row.label.trim() || row.event }));
  const update = (index: number, change: Partial<EditorRow>) =>
    setRows((all) =>
      all.map((row, i) => (i === index ? { ...row, ...change } : row)),
    );
  const move = (index: number, by: number) =>
    setRows((all) => {
      const target = index + by;
      if (target < 0 || target >= all.length) {
        return all;
      }
      const next = [...all];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  const save = async () => {
    try {
      await onSave(chosen, completeRatio(ratio, chosen));
      toast.success("האירועים נשמרו");
      onOpenChange(false);
    } catch (error) {
      console.error("[TrackedEventsEditor] save failed", error);
      toast.error("שמירת האירועים נכשלה");
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>אירועים באתר</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          סמנו את האירועים מ-Google Analytics שהדשבורד יציג, תנו לכל אחד שם
          בעברית וסדרו אותם לפי שלבי המשפך.
        </p>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.event} className="flex items-center gap-2">
              <Checkbox
                checked={row.on}
                onCheckedChange={(checked) =>
                  update(index, { on: checked === true })
                }
                aria-label={row.event}
              />
              <span
                className="w-44 shrink-0 font-mono text-xs truncate"
                dir="ltr"
              >
                {row.event}
              </span>
              <Input
                value={row.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="שם בעברית"
                disabled={!row.on}
              />
              <span className="w-14 shrink-0 text-xs text-muted-foreground text-left">
                {row.count.toLocaleString("en-US")}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(index, -1)}
                aria-label="למעלה"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(index, 1)}
                aria-label="למטה"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              אין אירועים מ-Google Analytics בתקופה שנבחרה
            </p>
          )}
        </div>
        <RatioPicker events={chosen} value={ratio} onChange={setRatio} />
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            שמירה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
