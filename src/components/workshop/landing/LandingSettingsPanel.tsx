import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  draftOf,
  draftProblem,
  type LandingSettingsDraft,
  type TrackingDraft,
} from "./landingSettings";
import { LandingAddressFields } from "./LandingAddressFields";
import { LandingDomainSection } from "./LandingDomainSection";
import { LandingSettingsHeader } from "./LandingSettingsHeader";
import { LandingTrackingFields } from "./LandingTrackingFields";
import { LeadDestinationFields } from "./LeadDestinationFields";
import { useLandingSettings } from "./useLandingSettings";
import { useSettingsOpen } from "./useSettingsOpen";

/**
 * A landing project's settings: its address, where its leads go, and its site's tracking ids and
 * custom domain.
 */
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
  const [expanded, setExpanded] = useSettingsOpen();
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
  // The site's sections wait while the panel reads the settings again, so an older copy of the
  // site's values is never saved.
  const siteBusy = settings.isFetching || settings.isPaused;
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
    <Collapsible asChild open={expanded} onOpenChange={setExpanded}>
      <section
        aria-label="הגדרות עמוד נחיתה"
        className="shrink-0 border-b bg-muted/30 px-4 py-2"
      >
        <LandingSettingsHeader expanded={expanded} saved={saved} />

        {/* Stays mounted while closed, so unsaved drafts survive; scrolls inside a capped height,
            so the page's copy below stays in view. */}
        <CollapsibleContent
          forceMount
          hidden={!expanded}
          className="max-h-[50vh] space-y-4 overflow-y-auto pb-2 pt-2"
        >
          <LandingAddressFields
            draft={draft}
            saved={saved}
            onChange={setDraft}
          />

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
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              שמירה
            </Button>
            {problem ? (
              <p className="text-sm text-muted-foreground">{problem}</p>
            ) : null}
          </div>

          {saved.siteExists ? (
            <LandingTrackingFields
              // A new project starts from its own saved ids: an unsaved draft never carries over.
              key={itemId}
              saved={saved.tracking}
              saves={trackingSaves}
              pending={saveTracking.isPending || siteBusy}
              onSave={submitTracking}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              אחרי שמירת כתובת האתר אפשר להוסיף לו קודי מעקב ודומיין.
            </p>
          )}

          {saved.siteExists ? (
            <LandingDomainSection
              // Its own state per project: an answer or a draft never carries over.
              key={`domain-${itemId}`}
              itemId={itemId}
              saved={saved}
              settingsBusy={siteBusy}
            />
          ) : null}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
