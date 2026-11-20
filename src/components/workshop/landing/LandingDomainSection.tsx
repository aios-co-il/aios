import { useState } from "react";
import { toast } from "sonner";
import type { LandingDomainResult } from "../../../../supabase/functions/_shared/workshop/landing/site-domain.ts";
import type { LandingSettings } from "./landingSettings";
import { LandingDomainFields } from "./LandingDomainFields";
import { useLandingDomain } from "./useLandingDomain";

/**
 * The site's custom domain section of the settings panel: saves and connects the domain, checks
 * its verification and keeps landing-domain's last answer. Mount it with a key per project, so an
 * answer or an unsaved draft never shows on another project.
 */
export function LandingDomainSection({
  itemId,
  saved,
  settingsBusy,
}: {
  itemId: string;
  saved: LandingSettings;
  /** The panel is reading the settings again: the field waits for the current domain. */
  settingsBusy: boolean;
}) {
  const { saveDomain, checkDomain } = useLandingDomain(itemId);
  const [saves, setSaves] = useState(0);
  const [result, setResult] = useState<LandingDomainResult>();

  /** Saves the site's domain, connects it in Vercel and tells the user how it ended. */
  function submit(domain: string) {
    saveDomain.mutate(domain, {
      onSuccess: (answer) => {
        setSaves((count) => count + 1);
        setResult(answer);
        toast.success(
          answer.available && answer.domain
            ? "הדומיין נשמר וחובר"
            : "הדומיין נשמר",
        );
      },
      onError: (error) => toast.error(error.message || "השמירה נכשלה"),
    });
  }

  /** Reads the domain's verification and tells the user when the check failed. */
  function check() {
    checkDomain.mutate(undefined, {
      onSuccess: setResult,
      onError: (error) => toast.error(error.message || "הבדיקה נכשלה"),
    });
  }

  return (
    <LandingDomainFields
      saved={saved.customDomain}
      verified={saved.customDomainVerified}
      saves={saves}
      pending={saveDomain.isPending || settingsBusy}
      checking={checkDomain.isPending}
      result={resultFor(result, saved.customDomain)}
      onSave={submit}
      onCheck={check}
    />
  );
}

/**
 * The answer while it still describes the saved domain; an answer about a domain saved over since
 * (a late check, or a save whose connection failed) is not shown for the new one.
 */
function resultFor(
  result: LandingDomainResult | undefined,
  saved: string,
): LandingDomainResult | undefined {
  if (!result?.available) {
    return result;
  }
  return (result.domain ?? "") === saved ? result : undefined;
}
