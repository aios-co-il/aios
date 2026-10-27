import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { memberName } from "../../../../supabase/functions/_shared/carmen-report-recipients/names.ts";
import type { ReportStaffMember } from "../../../../supabase/functions/_shared/carmen-report-recipients/resolve.ts";
import { RecipientWarning } from "./RecipientWarning";
import { SKIP_WARNINGS } from "./skipWarnings";

/** Searchable list of the organization's staff who are not on the list yet. */
export function StaffMemberPicker({
  staff,
  adding,
  onAdd,
}: {
  staff: ReportStaffMember[];
  adding: boolean;
  onAdd: (userId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const matches = filterStaff(staff, search);
  return (
    <div className="space-y-1.5">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="חיפוש חבר צוות"
        aria-label="חיפוש חבר צוות"
        className="h-8 text-xs"
      />
      <ul
        className="max-h-40 divide-y overflow-y-auto rounded-md border"
        aria-label="חברי צוות"
      >
        {matches.map((member) => {
          const name = memberName(member);
          return (
            <li
              key={member.user_id}
              className="flex items-center justify-between gap-2 px-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs">{name}</p>
                {member.phone ? (
                  <p
                    dir="ltr"
                    className="text-right text-[11px] text-muted-foreground"
                  >
                    {member.phone}
                  </p>
                ) : (
                  <RecipientWarning text={SKIP_WARNINGS.member_without_phone} />
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 text-xs"
                aria-label={`הוסף את ${name}`}
                disabled={adding}
                onClick={() => onAdd(member.user_id)}
              >
                הוסף
              </Button>
            </li>
          );
        })}
        {!matches.length && (
          <li className="px-3 py-2 text-[11px] text-muted-foreground">
            אין חברי צוות נוספים
          </li>
        )}
      </ul>
    </div>
  );
}

/** Members whose name contains the search text, or whose phone contains its digits. */
function filterStaff(staff: ReportStaffMember[], search: string) {
  const text = search.trim().toLowerCase();
  const digits = text.replace(/\D/g, "");
  if (!text) {
    return staff;
  }
  return staff.filter(
    (member) =>
      (member.full_name || "").toLowerCase().includes(text) ||
      (digits !== "" &&
        (member.phone || "").replace(/\D/g, "").includes(digits)),
  );
}
