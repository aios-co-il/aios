import { Label } from "@/components/ui/label";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useUserRole } from "@/hooks/useUserRole";
import { ExtraPhoneForm } from "./ExtraPhoneForm";
import { ReportRecipientList } from "./ReportRecipientList";
import { StaffMemberPicker } from "./StaffMemberPicker";
import { useReportRecipientMutations } from "./useReportRecipientMutations";
import { useReportRecipients } from "./useReportRecipients";

/**
 * "כרמן מדווחת ל": whom the organization's Carmen sends the Sunday digests,
 * instant pulse alerts and notifications to. Owners and agency owners only.
 */
export function CarmenReportRecipientsSection() {
  const { tenantId } = useCurrentTenant();
  const { isOwner, isAgencyOwner } = useUserRole();
  if (!tenantId || !(isOwner || isAgencyOwner)) {
    return null;
  }
  return <ReportRecipientsEditor tenantId={tenantId} />;
}

/** The list, the team picker and the extra-phone form for one organization. */
function ReportRecipientsEditor({ tenantId }: { tenantId: string }) {
  const { rows, staff, resolved, isLoading, isError } =
    useReportRecipients(tenantId);
  const { addMember, addPhone, remove } = useReportRecipientMutations(tenantId);
  const configuredIds = new Set(rows.map((row) => row.user_id));

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-xs font-medium">כרמן מדווחת ל</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          דוחות יום ראשון, התראות דופק מיידיות והודעות כרמן של הארגון. רשימה
          ריקה — הדוחות לבעלי הארגון.
        </p>
      </div>
      {isError ? (
        <p className="text-[11px] text-destructive">שגיאה בטעינת הנמענים</p>
      ) : isLoading ? (
        <p className="text-[11px] text-muted-foreground">טוען…</p>
      ) : (
        <>
          <ReportRecipientList
            rows={rows}
            staff={staff}
            resolved={resolved}
            removing={remove.isPending}
            onRemove={(id) => remove.mutate(id)}
          />
          <StaffMemberPicker
            staff={staff.filter((member) => !configuredIds.has(member.user_id))}
            adding={addMember.isPending}
            onAdd={(userId) => addMember.mutate(userId)}
          />
          <ExtraPhoneForm
            adding={addPhone.isPending}
            onAdd={(input, options) => addPhone.mutate(input, options)}
          />
        </>
      )}
    </div>
  );
}
