import { Loader2, ShieldCheck } from "lucide-react";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useUserRole } from "@/hooks/useUserRole";
import { useTeamMembersForMeeting } from "@/hooks/useTeamMembersForMeeting";
import { useCarmenPermissions } from "./carmen-permissions/useCarmenPermissions";
import { MemberPermissionsCard } from "./carmen-permissions/MemberPermissionsCard";

/**
 * Carmen settings → הרשאות: who may use Carmen, which of her brains, and at
 * what level. A member with no row is unrestricted (today's behaviour).
 */
export function CarmenPermissionsTab({ agent }: { agent: { id: string } }) {
  const { tenantId } = useCurrentTenant();
  const { isOwner, isAgencyOwner, isSuperAdmin, isTeamManager } = useUserRole();
  const canManage = isOwner || isAgencyOwner || isSuperAdmin || isTeamManager;
  const { data: members = [], isLoading: membersLoading } =
    useTeamMembersForMeeting(tenantId);
  const { routes, byUser, save, loading } = useCarmenPermissions(
    tenantId,
    agent.id,
  );

  if (membersLoading || loading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-start gap-2 rounded-lg border p-3 text-right text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          לכל איש צוות אפשר לקבוע אם הוא עובד עם כרמן, ובאילו מוחות: גישה מלאה,
          תיקונים בלבד (למוחות קוד כמו Cursor ו-Claude), או בלי גישה. מי שלא
          הוגדר לו כלום עובד כמו היום, בלי הגבלה.
          {!canManage && " רק מנהלים יכולים לשנות הרשאות."}
        </p>
      </div>

      {members.map((m) => (
        <MemberPermissionsCard
          key={m.id}
          member={m}
          row={byUser.get(m.id)}
          routes={routes}
          disabled={!canManage || save.isPending}
          onSave={(patch) => save.mutate({ userId: m.id, patch })}
        />
      ))}
    </div>
  );
}
