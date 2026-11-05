import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { SetMemberActiveResult } from "@functions/_shared/user-admin/member-results.ts";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { MEMBER_STATUSES_KEY } from "@/hooks/useDepartedMembers";
import { TENANT_MEMBER_NAMES_KEY } from "@/hooks/useTenantMemberNames";
import { invokeEdgeFunction } from "@/lib/edgeFunctionInvoke";

/** The member lists a deactivation, reactivation or delete changes. */
export const MEMBER_LIST_KEYS = [
  ["users-with-roles"],
  ["team-members-manage"],
  [MEMBER_STATUSES_KEY],
  [TENANT_MEMBER_NAMES_KEY],
] as const;

/** Deactivates (active: false) or reactivates a member of the current organization through set-user-active. */
export function useMemberActivation() {
  const { tenantId } = useCurrentTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) => {
      if (!tenantId) {
        throw new Error("לא נמצא ארגון פעיל");
      }
      return invokeEdgeFunction<SetMemberActiveResult>("set-user-active", {
        userId,
        tenantId,
        active,
      });
    },
    onSuccess: (result) => {
      for (const queryKey of MEMBER_LIST_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
      toast.success(successMessage(result));
    },
    onError: (error: Error) => {
      toast.error("שגיאה בעדכון המשתמש: " + error.message);
    },
  });
}

/** What the owner is told after the change. */
function successMessage(result: SetMemberActiveResult): string {
  if (result.active) {
    return "המשתמש הופעל מחדש";
  }
  return result.signInBlocked
    ? "המשתמש הושבת ולא יוכל להתחבר; העדכונים שלו נשארים בהיסטוריה"
    : "המשתמש הושבת בארגון הזה; העדכונים שלו נשארים בהיסטוריה";
}
