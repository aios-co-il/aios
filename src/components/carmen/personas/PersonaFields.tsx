import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/** A labelled field. */
export function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** One "who sees it" option for a new character. */
function AudienceOption({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={`persona-audience-${value}`} />
      <Label htmlFor={`persona-audience-${value}`}>{label}</Label>
    </div>
  );
}

/**
 * Where a save goes: owners and super admins choose "only me" or "the whole
 * org"; anyone else editing a shared character is told it becomes their own version.
 */
export function SaveScope({
  canChoose,
  savesOwnVersion,
  forOrg,
  onChange,
}: {
  canChoose: boolean;
  savesOwnVersion: boolean;
  forOrg: boolean;
  onChange: (forOrg: boolean) => void;
}) {
  if (canChoose) {
    return (
      <RadioGroup
        dir="rtl"
        aria-label="למי נשמרת הדמות"
        value={forOrg ? "org" : "me"}
        onValueChange={(value) => onChange(value === "org")}
        className="flex gap-6"
      >
        <AudienceOption value="me" label="רק אצלי" />
        <AudienceOption value="org" label="לכל הארגון" />
      </RadioGroup>
    );
  }
  if (!savesOwnVersion) {
    return null;
  }
  return (
    <p className="text-sm text-muted-foreground">
      השינויים נשמרים כגרסה שלך בלבד. כרמן הראשית של הארגון לא משתנה.
    </p>
  );
}
