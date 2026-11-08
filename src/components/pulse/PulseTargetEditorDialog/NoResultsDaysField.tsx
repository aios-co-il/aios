import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_NO_RESULTS_DAYS,
  MAX_NO_RESULTS_DAYS,
  MIN_NO_RESULTS_DAYS,
} from "../../../../supabase/functions/_shared/pulse/no-results-window.ts";
import { useClientNoResultsDays } from "./useClientNoResultsDays";

const LABEL = "ימים מלאים בלי לידים או מכירות לפני התראה";

/**
 * The client's full days without leads or sales before the pulse alerts on a
 * campaign that spends (clients.pulse_no_results_days, AIO-502). It applies to
 * every platform of the client, so it sits above the platform's targets.
 */
export function NoResultsDaysField({ clientId }: { clientId: string }) {
  const { days, isLoading, save, saving } = useClientNoResultsDays(clientId);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (days !== undefined) {
      setDraft(String(days));
    }
  }, [days]);
  const value = Number(draft);
  const valid =
    draft.trim() !== "" &&
    Number.isInteger(value) &&
    value >= MIN_NO_RESULTS_DAYS &&
    value <= MAX_NO_RESULTS_DAYS;

  return (
    <div className="rounded-lg border p-3 space-y-1">
      <Label htmlFor="pulse-no-results-days" className="text-xs">
        {LABEL}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="pulse-no-results-days"
          type="number"
          min={MIN_NO_RESULTS_DAYS}
          max={MAX_NO_RESULTS_DAYS}
          className="h-8 w-24"
          value={draft}
          disabled={isLoading}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!valid || value === days || saving}
          onClick={() => save(value)}
        >
          שמור
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        קמפיין לידים או מכירות שמוציא כסף בלי תוצאות במשך מספר הימים הזה מקבל
        התראה. בין {MIN_NO_RESULTS_DAYS} ל־{MAX_NO_RESULTS_DAYS}; ברירת המחדל{" "}
        {DEFAULT_NO_RESULTS_DAYS}. חל על כל הפלטפורמות של הלקוח.
      </p>
    </div>
  );
}
