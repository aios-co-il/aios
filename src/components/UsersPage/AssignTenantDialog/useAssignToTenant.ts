import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { UserRole } from "@/hooks/useUserRole";
import { invokeEdgeFunction } from "@/lib/edgeFunctionInvoke";
import type { ManagedUser } from "../userListTypes";
import { USER_TENANTS_KEY } from "./useUserTenantIds";

/** What the owner chose for the user in the other organization. */
export interface TenantAssignment {
  tenantId: string;
  role: UserRole;
  agencyIds: Array<string>;
  clientIds: Array<string>;
  modulePermissions: Array<string>;
}

/**
 * Adds an existing user to another organization through invite-user, which
 * gives them access to it and keeps their profile and other organizations
 * as they are. No email is sent: the user already has an account.
 */
export function useAssignToTenant(
  user: ManagedUser | null,
  onDone: () => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (assignment: TenantAssignment) => {
      if (!user) {
        throw new Error("לא נבחר משתמש");
      }
      return invokeEdgeFunction("invite-user", {
        email: user.email,
        fullName: user.full_name ?? undefined,
        ...assignment,
        baseUrl: window.location.origin,
        skipEmail: true,
        updateProfileTeamLinks: true,
      });
    },
    onSuccess: async () => {
      toast.success("המשתמש שויך לארגון");
      await queryClient.invalidateQueries({
        queryKey: [USER_TENANTS_KEY, user?.id],
      });
      onDone();
    },
    onError: (error: Error) => {
      toast.error(
        error.message === "EMAIL_EXISTS_IN_TENANT"
          ? "המשתמש כבר שייך לארגון הזה"
          : `שיוך לארגון נכשל: ${error.message}`,
      );
    },
  });
}
