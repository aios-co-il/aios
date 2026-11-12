import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";

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
export function AudienceOption({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={`persona-audience-${value}`} />
      <Label htmlFor={`persona-audience-${value}`}>{label}</Label>
    </div>
  );
}
