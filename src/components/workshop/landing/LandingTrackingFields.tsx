import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TRACKING_ID_KEYS } from "../../../../supabase/functions/_shared/workshop/landing/site-tracking.ts";
import {
  TRACKING_FIELDS,
  trackingProblem,
  type TrackingDraft,
} from "./landingSettings";

/**
 * The client's site tracking ids: Google Tag Manager, GA4 and Meta Pixel. They belong to the
 * site, not the page, and reach the live site with the next publish.
 */
export function LandingTrackingFields({
  saved,
  saves,
  pending,
  onSave,
}: {
  saved: TrackingDraft;
  /** How many tracking saves have landed: each one starts the fields over. */
  saves: number;
  pending: boolean;
  onSave: (draft: TrackingDraft) => void;
}) {
  const [draft, setDraft] = useState(saved);
  const savedKey = JSON.stringify(saved);

  // The fields follow the stored ids: they start over when the ids change or a tracking save
  // lands, and keep unsaved edits when an address or lead save refreshes the settings.
  useEffect(() => {
    setDraft(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every refresh gives a new `saved`; savedKey is its content
  }, [savedKey, saves]);

  const problem = trackingProblem(draft);
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">מעקב</legend>
      <p className="text-xs text-muted-foreground">
        הקודים חלים על כל העמודים באתר של הלקוח, ועולים לאוויר בפרסום הבא.
        השאירו שדה ריק כדי להסיר קוד.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {TRACKING_ID_KEYS.map((key) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`landing-tracking-${key}`}>
              {TRACKING_FIELDS[key].label}
            </Label>
            <Input
              id={`landing-tracking-${key}`}
              dir="ltr"
              autoComplete="off"
              placeholder={TRACKING_FIELDS[key].example}
              value={draft[key]}
              disabled={pending}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.value.toUpperCase() })
              }
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!problem || pending}
          onClick={() => onSave(draft)}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          שמירת קודי מעקב
        </Button>
        {problem ? (
          <p className="text-sm text-muted-foreground">{problem}</p>
        ) : null}
      </div>
    </fieldset>
  );
}
