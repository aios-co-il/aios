import { Inbox, UserPlus } from "lucide-react";
import { AddLeadForm } from "@/components/forms/AddLeadForm";

/** Shown when the tenant has no leads yet: an invitation to add the first. */
export function LeadsEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-6 py-14 text-center shadow-elevation-1">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-accent-100 text-brand-accent-800 dark:bg-brand-accent-900 dark:text-brand-accent-100">
        <UserPlus className="h-6 w-6" />
      </span>
      <p className="text-base font-semibold">אין עדיין לידים במערכת</p>
      <AddLeadForm />
    </div>
  );
}

/** A quiet line inside a table card when nothing matches. */
export function LeadsEmptyMessage({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <Inbox className="h-6 w-6" />
      {text}
    </div>
  );
}
