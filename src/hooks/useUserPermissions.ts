import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "./useCurrentTenant";
import { useUserRole } from "./useUserRole";

/**
 * ModulePermission
 * ─────────────────────────────────────────────────────────────────────────────
 * ה-catalog נגזר ממבנה התפריט (menuStructure.ts → modules.ts), לכן הטיפוס הוא
 * string — אין צורך לתחזק כאן union ידני כשמוסיפים מודול.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type ModulePermission = string;

export function useUserPermissions() {
  const {
    isOwner,
    isSuperAdmin,
    isCampaigner,
    isTeamManager,
    isAgencyOwner,
    userId,
  } = useUserRole();
  const { tenantId } = useCurrentTenant();
  const hasManagementAccess = isOwner || isTeamManager || isAgencyOwner;

  const {
    data: permissionsData,
    isPending: permissionsPending,
    isFetching: permissionsFetching,
    isError: permissionsError,
    isFetchedAfterMount: permissionsFetchedAfterMount,
  } = useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: async () => {
      if (!userId) return { permissions: null, hasAnyPermissions: false };

      const { data, error } = await supabase
        .from("user_permissions")
        .select("module, can_access")
        .eq("user_id", userId);

      if (error) {
        console.error("Error fetching permissions:", error);
        throw error;
      }

      const permissionsMap: Record<string, boolean> = {};
      data?.forEach((perm) => {
        permissionsMap[perm.module] = perm.can_access;
      });

      return {
        permissions: permissionsMap,
        hasAnyPermissions: !!data && data.length > 0,
      };
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  // Block only on first load — keep using cached permissions during background refetch.
  const isLoading = !userId || permissionsPending;

  const hasPermission = (module: ModulePermission): boolean => {
    // While loading or user unknown, do NOT allow (prevents leaks)
    if (isLoading) return false;

    // Super admins can access all modules in the UI
    if (isSuperAdmin) return true;

    const { permissions, hasAnyPermissions } = permissionsData || {
      permissions: null,
      hasAnyPermissions: false,
    };

    // ── מודולים שדורשים הרשאה מפורשת (גם לבעלים) ─────────────────────
    const restrictedModules: ModulePermission[] = [
      "sales_dashboard",
      "leads",
      "sales_people",
      "integrations",
      "lead_integrations",
      "automations",
      "tenants",
      "menu_management",
      "fields_management",
      "branding",
      "manychat_settings",
      "green_api_settings",
      "manus_wa_settings",
      "chat_integrations",
      "accounting_integrations",
      "ai_support",
    ];

    // ── בעלים תמיד רואים מודולי ניהול ────────────────────────────────
    if (
      hasManagementAccess &&
      (module === "tenants" ||
        module === "menu_management" ||
        module === "fields_management" ||
        module === "ai_support" ||
        module === "automations")
    ) {
      return true;
    }

    if (restrictedModules.includes(module)) {
      // Hub permission id is `integrations`; legacy rows may only have `lead_integrations`.
      if (module === "integrations") {
        return (
          permissions?.integrations === true ||
          permissions?.lead_integrations === true
        );
      }
      return permissions?.[module] === true;
    }

    // Campaigners need pulse dashboard access; row scope is enforced in DMMDashboard + RLS.
    if (isCampaigner && module === "crm_dashboard") return true;

    // ── מודולים נגישים לכל המשתמשים המאומתים ─────────────────────────
    const alwaysAccessibleModules: ModulePermission[] = [
      "team_chat",
      "settings",
      "reports",
    ];

    if (alwaysAccessibleModules.includes(module)) return true;

    // ── אם אין הרשאות מוגדרות כלל ────────────────────────────────────
    if (!hasAnyPermissions) {
      if (hasManagementAccess) return true;
      return false;
    }

    // ── בעלים / מנהלי צוות / בעלי סוכנות — מודולים לא-מוגבלים ─────────
    if (hasManagementAccess && !restrictedModules.includes(module)) return true;

    return permissions?.[module] === true;
  };

  // Finance access comes from the helpers the finance RLS policies use, so the
  // UI never offers a read or write the database refuses: the role flags above
  // differ from has_role / is_super_admin, and hasPermission lets management
  // roles through.
  const { data: financeAccess, isPending: financeAccessPending } = useQuery({
    queryKey: ["finance-access", userId, tenantId],
    queryFn: userId ? () => fetchFinanceAccess(userId) : skipToken,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  /** Read rule: owner, super admin, finance_view or finance (has_finance_permission). */
  const canViewFinance = (): boolean => financeAccess?.read === true;

  /** Write rule: owner, super admin or finance (has_finance_write_permission). */
  const canEditFinance = (): boolean => financeAccess?.write === true;

  return {
    hasPermission,
    canViewFinance,
    canEditFinance,
    /** False until the finance access answer is in, so callers can show nothing instead of "no access". */
    financeAccessReady: !financeAccessPending,
    isLoading,
    isFetching: permissionsFetching,
    isError: permissionsError,
    isReady: permissionsData !== undefined,
    isFetchedAfterMount: permissionsFetchedAfterMount,
    isSuperAdmin,
    isOwner,
  };
}

/** Asks the database helpers behind the finance RLS policies whether the user may read and write financial data. */
async function fetchFinanceAccess(
  userId: string,
): Promise<{ read: boolean; write: boolean }> {
  const [read, write] = await Promise.all([
    supabase.rpc("has_finance_permission", { _user_id: userId }),
    supabase.rpc("has_finance_write_permission", { _user_id: userId }),
  ]);
  if (read.error) {
    throw read.error;
  }
  if (write.error) {
    throw write.error;
  }
  return { read: read.data === true, write: write.data === true };
}
