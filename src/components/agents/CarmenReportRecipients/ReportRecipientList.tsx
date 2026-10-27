import { Phone, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CarmenReportRecipients,
  ReportStaffMember,
} from "../../../../supabase/functions/_shared/carmen-report-recipients/resolve.ts";
import { RecipientWarning } from "./RecipientWarning";
import { SKIP_WARNINGS } from "./skipWarnings";

/**
 * The configured recipients, each with a warning when Carmen cannot reach
 * them; an empty list shows the owners Carmen falls back to.
 */
export function ReportRecipientList({
  rows,
  staff,
  resolved,
  removing,
  onRemove,
}: {
  rows: ReportRecipientRow[];
  staff: ReportStaffMember[];
  resolved: CarmenReportRecipients;
  removing: boolean;
  onRemove: (id: string) => void;
}) {
  if (!rows.length) {
    return <OwnerFallbackNote resolved={resolved} />;
  }
  return (
    <ul className="space-y-1.5" aria-label="נמעני הדיווח">
      {rows.map((row) => (
        <RecipientItem
          key={row.id}
          row={row}
          member={staff.find((m) => m.user_id === row.user_id)}
          resolved={resolved}
          removing={removing}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
}

/** One configured recipient with its phone, warning and remove button. */
function RecipientItem({
  row,
  member,
  resolved,
  removing,
  onRemove,
}: {
  row: ReportRecipientRow;
  member: ReportStaffMember | undefined;
  resolved: CarmenReportRecipients;
  removing: boolean;
  onRemove: (id: string) => void;
}) {
  const name = row.user_id
    ? member?.full_name || "חבר צוות"
    : row.label || "מספר נוסף";
  const phone = row.user_id ? member?.phone : row.phone;
  const skip = resolved.skipped.find((s) =>
    row.user_id ? s.user_id === row.user_id : !s.user_id && s.name === name,
  );
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {row.user_id ? (
            <User className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Phone className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{name}</span>
        </div>
        {phone && (
          <p dir="ltr" className="text-right text-[11px] text-muted-foreground">
            {phone}
          </p>
        )}
        {skip && <RecipientWarning text={SKIP_WARNINGS[skip.reason]} />}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        aria-label={`הסר את ${name}`}
        disabled={removing}
        onClick={() => onRemove(row.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

/** Empty list: Carmen reports to the owners who have a phone. */
function OwnerFallbackNote({ resolved }: { resolved: CarmenReportRecipients }) {
  if (!resolved.recipients.length) {
    return (
      <RecipientWarning text="הרשימה ריקה ולאף בעלים אין טלפון — כרמן לא תשלח דוחות" />
    );
  }
  return (
    <p className="text-[11px] text-muted-foreground">
      הרשימה ריקה — כרמן מדווחת לבעלי הארגון:{" "}
      {resolved.recipients.map((r) => r.name).join(", ")}
    </p>
  );
}

export type ReportRecipientRow = {
  id: string;
  user_id: string | null;
  phone: string | null;
  label: string | null;
};
