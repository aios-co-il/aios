import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LandingSettingsDraft } from "./landingSettings";

/** Where a page's leads go: the org's CRM, a webhook, or both. */
export function LeadDestinationFields({
  draft,
  hasStoredUrl,
  onChange,
}: {
  draft: LandingSettingsDraft;
  /** A webhook URL is already stored; it is never shown, only replaced. */
  hasStoredUrl: boolean;
  onChange: (draft: LandingSettingsDraft) => void;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">לאן נשלחים הלידים</legend>
      <div className="flex items-center gap-2">
        <Switch
          id="landing-crm"
          checked={draft.leadToCrm}
          onCheckedChange={(leadToCrm) => onChange({ ...draft, leadToCrm })}
        />
        <Label htmlFor="landing-crm">ל-CRM של הארגון</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="landing-webhook"
          checked={draft.leadToWebhook}
          onCheckedChange={(leadToWebhook) =>
            onChange({ ...draft, leadToWebhook })
          }
        />
        <Label htmlFor="landing-webhook">לוובהוק</Label>
      </div>
      {draft.leadToWebhook ? (
        <div className="space-y-1.5">
          <Label htmlFor="landing-webhook-url">כתובת הוובהוק</Label>
          <Input
            id="landing-webhook-url"
            dir="ltr"
            type="url"
            autoComplete="off"
            placeholder={
              hasStoredUrl ? "כתובת שמורה. הזינו חדשה כדי להחליף" : "https://"
            }
            value={draft.webhookUrl}
            onChange={(event) =>
              onChange({ ...draft, webhookUrl: event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            הכתובת נשמרת בצורה מאובטחת ואינה מוצגת שוב אחרי השמירה.
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
