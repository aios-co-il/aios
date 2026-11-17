import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LANDING_ROOT_DOMAIN,
  draftProblem,
  landingPageUrl,
  type LandingSettings,
  type LandingSettingsDraft,
} from "./landingSettings";
import { LeadDestinationFields } from "./LeadDestinationFields";
import { useLandingSettings } from "./useLandingSettings";

/** The form's starting values: what is stored, with the webhook URL always blank. */
function draftOf(saved: LandingSettings): LandingSettingsDraft {
  return {
    subdomain: saved.subdomain,
    slug: saved.slug,
    leadToCrm: saved.leadToCrm,
    leadToWebhook: saved.leadToWebhook,
    webhookUrl: "",
  };
}

/** A landing project's settings: its address and where its leads go. */
export function LandingSettingsPanel({
  tenantId,
  itemId,
  clientId,
}: {
  tenantId: string | undefined;
  itemId: string;
  clientId: string | null;
}) {
  const { settings, save } = useLandingSettings(tenantId, itemId, clientId);
  const saved = settings.data;
  const [draft, setDraft] = useState<LandingSettingsDraft | null>(null);

  // The form follows what is stored, and starts over when another project opens or a save lands.
  useEffect(() => {
    setDraft(saved ? draftOf(saved) : null);
  }, [saved, itemId]);

  if (settings.isLoading) {
    return <Loader2 className="m-4 h-4 w-4 animate-spin" aria-label="טוען" />;
  }
  if (settings.isError || !saved || !draft) {
    return (
      <p className="p-4 text-sm text-destructive">
        לא הצלחנו לטעון את הגדרות עמוד הנחיתה
      </p>
    );
  }
  if (!clientId) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        כדי להגדיר עמוד נחיתה צריך קודם לשייך את הפרויקט ללקוח.
      </p>
    );
  }

  const problem = draftProblem(draft, saved);
  const hasStoredUrl = saved.pageExists && saved.leadToWebhook;
  /** Saves the draft and tells the user how it ended. */
  function submit() {
    if (!draft) {
      return;
    }
    save.mutate(draft, {
      onSuccess: () => toast.success("ההגדרות נשמרו"),
      onError: (error) => toast.error(error.message || "השמירה נכשלה"),
    });
  }

  return (
    <section
      aria-label="הגדרות עמוד נחיתה"
      className="shrink-0 space-y-4 border-b bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">הגדרות עמוד נחיתה</h2>
        {saved.pageExists ? (
          <a
            href={landingPageUrl(saved.subdomain, saved.slug)}
            target="_blank"
            rel="noreferrer"
            dir="ltr"
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            {landingPageUrl(saved.subdomain, saved.slug).replace(
              "https://",
              "",
            )}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="landing-subdomain">תת־דומיין של הלקוח</Label>
          <div className="flex items-center gap-1" dir="ltr">
            <Input
              id="landing-subdomain"
              value={draft.subdomain}
              disabled={saved.siteExists}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  subdomain: event.target.value.toLowerCase(),
                })
              }
            />
            <span className="shrink-0 text-sm text-muted-foreground">
              .{LANDING_ROOT_DOMAIN}
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="landing-slug">כתובת העמוד</Label>
          <Input
            id="landing-slug"
            dir="ltr"
            value={draft.slug}
            disabled={saved.pageExists}
            onChange={(event) =>
              setDraft({ ...draft, slug: event.target.value.toLowerCase() })
            }
          />
          <p className="text-xs text-muted-foreground">
            home הוא העמוד הראשי של האתר.
          </p>
        </div>
      </div>

      <LeadDestinationFields
        draft={draft}
        hasStoredUrl={hasStoredUrl}
        onChange={setDraft}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={!!problem || save.isPending}
          onClick={submit}
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          שמירה
        </Button>
        {problem ? (
          <p className="text-sm text-muted-foreground">{problem}</p>
        ) : null}
      </div>
    </section>
  );
}
