import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  customDomainProblem,
  type LandingDomainResult,
  normalizeDomain,
} from "../../../../supabase/functions/_shared/workshop/landing/site-domain.ts";
import { LandingDnsRecords } from "./LandingDnsRecords";

/**
 * The client's site custom domain: the hostname, its own save (which also connects it in Vercel),
 * the DNS record the client adds and the domain's verification, with a check button.
 */
export function LandingDomainFields({
  saved,
  verified,
  saves,
  pending,
  checking,
  result,
  onSave,
  onCheck,
}: {
  /** The saved domain; empty when the site has none. */
  saved: string;
  /** Vercel verified the saved domain, as last recorded. */
  verified: boolean;
  /** How many domain saves have landed: each one starts the field over. */
  saves: number;
  pending: boolean;
  checking: boolean;
  /** landing-domain's last answer for the saved domain, once connected or checked. */
  result: LandingDomainResult | undefined;
  onSave: (domain: string) => void;
  onCheck: () => void;
}) {
  const [draft, setDraft] = useState(saved);

  // The field follows the saved domain: it starts over when the domain changes or a domain save
  // lands, and keeps an unsaved edit when another section's save refreshes the settings.
  useEffect(() => {
    setDraft(saved);
  }, [saved, saves]);

  const problem = customDomainProblem(draft);
  const unchanged = normalizeDomain(draft) === saved;
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">דומיין</legend>
      <p className="text-xs text-muted-foreground">
        דומיין של הלקוח לאתר, למשל lp.example.co.il. הוא חל על כל העמודים באתר,
        ועולה לאוויר בפרסום הבא. השאירו ריק כדי להסיר.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1 space-y-1.5">
          <Label htmlFor="landing-custom-domain">דומיין</Label>
          <Input
            id="landing-custom-domain"
            dir="ltr"
            autoComplete="off"
            placeholder="lp.example.co.il"
            value={draft}
            disabled={pending}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!!problem || unchanged || pending}
          onClick={() => onSave(draft)}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          שמירת דומיין
        </Button>
      </div>
      {problem ? (
        <p className="text-sm text-muted-foreground">{problem}</p>
      ) : null}
      {saved ? (
        <DomainStatus
          verified={verified}
          result={result}
          checking={checking}
          disabled={pending}
          onCheck={onCheck}
        />
      ) : null}
    </fieldset>
  );
}

/** The saved domain's verification, its DNS records and the check button. */
function DomainStatus({
  verified,
  result,
  checking,
  disabled,
  onCheck,
}: {
  verified: boolean;
  result: LandingDomainResult | undefined;
  checking: boolean;
  disabled: boolean;
  onCheck: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm" role="status">
          {statusText(verified, result)}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={checking || disabled}
          onClick={onCheck}
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          בדיקה
        </Button>
      </div>
      {result?.available && result.records.length > 0 ? (
        <LandingDnsRecords records={result.records} />
      ) : null}
    </div>
  );
}

/** What the panel says about the saved domain, from the last answer or the stored verification. */
function statusText(
  verified: boolean,
  result: LandingDomainResult | undefined,
): string {
  if (!result) {
    return verified
      ? "הדומיין מאומת, והאתר זמין בו."
      : "הדומיין עוד לא מאומת. לחצו על בדיקה כדי לראות את רשומת ה-DNS שצריך להוסיף.";
  }
  if (!result.available) {
    return result.message;
  }
  if (!result.connected) {
    return "הדומיין עוד לא חובר ל-Vercel. שמרו אותו שוב.";
  }
  return result.verified
    ? "הדומיין מאומת, והאתר זמין בו."
    : "הדומיין עוד לא מאומת. הוסיפו אצל ספק הדומיין את הרשומה שלמטה; האימות יכול לקחת מכמה דקות עד כמה שעות.";
}
