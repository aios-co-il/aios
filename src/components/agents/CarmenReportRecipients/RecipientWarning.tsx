import { AlertTriangle } from "lucide-react";

/** One-line amber warning under a recipient or staff member. */
export function RecipientWarning({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1 text-[11px] text-amber-600">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      {text}
    </p>
  );
}
