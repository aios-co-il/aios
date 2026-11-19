import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  draftProblem,
  landingPageUrl,
  type LandingSettings,
  type LandingSettingsDraft,
  type TrackingDraft,
} from "./landingSettings";
import { LandingAddressFields } from "./LandingAddressFields";
import { LandingTrackingFields } from "./LandingTrackingFields";
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

/** A landing project's settings: its address, where its leads go and its site's tracking ids. */
export function LandingSettingsPanel({
  tenantId,
  itemId,
  clientId,
}: {
  tenantId: string | undefined;
  itemId: string;
  clientId: string | null;
}) {
  const { settings, save, saveTracking } = useLandingSettings(
    tenantId,
    itemId,
    clientId,
  );
  const saved = settings.data;
  const [draft, setDraft] = useState<LandingSettingsDraft | null>(null);
  const [saves, setSaves] = useState(0);
  const [trackingSaves, setTrackingSaves] = useState(0);
  const savedKey = saved ? JSON.stringify(draftOf(saved)) : null;

  // The form follows its own stored fields: it starts over when another project opens, when those
  // fields change or when its own save lands, and keeps unsaved edits when a tracking save
  // refreshes the settings.
  useEffect(() => {
    setDraft(saved ? draftOf(saved) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- every refresh gives a new `saved`; savedKey is the part this form edits
  }, [savedKey, itemId, saves]);

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
      onSuccess: () => {
        setSaves((count) => count + 1);
        toast.success("ההגדרות נשמרו");
      },
      onError: (error) => toast.error(error.message || "השמירה נכשלה"),
    });
  }
  /** Saves the site's tracking ids and tells the user how it ended. */
  function submitTracking(tracking: TrackingDraft) {
    saveTracking.mutate(tracking, {
      onSuccess: () => {
        setTrackingSaves((count) => count + 1);
        toast.success("קודי המעקב נשמרו");
      },
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

      <LandingAddressFields draft={draft} saved={saved} onChange={setDraft} />

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

      {saved.siteExists ? (
        <LandingTrackingFields
          saved={saved.tracking}
          saves={trackingSaves}
          pending={saveTracking.isPending}
          onSave={submitTracking}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          אחרי שמירת כתובת האתר אפשר להוסיף לו קודי מעקב.
        </p>
      )}
    </section>
  );
}
