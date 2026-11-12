import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole, UserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AddTenantForm } from "@/components/forms/AddTenantForm";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useTerminology } from "@/hooks/useTerminology";
import { useViewAs } from "@/contexts/ViewAsContext";
import { useAgency } from "@/contexts/AgencyContext";
import { useTenantPath } from "@/hooks/useTenantPath";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Shield, UserPlus, Building2 } from "lucide-react";
import { useState, useEffect } from "react";
import { EditUserAgenciesDialog } from "@/components/forms/EditUserAgenciesDialog";
import { EditUserPermissionsDialog } from "@/components/forms/EditUserPermissionsDialog";
import { EditUserNameDialog } from "@/components/forms/EditUserNameDialog";
import EditSalesPersonAgenciesDialog from "@/components/forms/EditSalesPersonAgenciesDialog";
import EditManagedAgenciesDialog from "@/components/forms/EditManagedAgenciesDialog";
import { ResetPasswordDialog } from "@/components/forms/ResetPasswordDialog";
import { InactiveMembersCard } from "@/components/UsersPage/InactiveMembersCard";
import { UsersList } from "@/components/UsersPage/UsersList";
import { InviteClientsPicker } from "@/components/UsersPage/InviteClientsPicker";
import { roleBadgeColors } from "@/components/UsersPage/userRoleStyles";
import type {
  ManagedUser,
  UsersListProps,
} from "@/components/UsersPage/userListTypes";
import { MEMBER_LIST_KEYS } from "@/components/UsersPage/useMemberActivation";
import type { DeleteMemberResult } from "@functions/_shared/user-admin/member-results.ts";
import { invokeEdgeFunction } from "@/lib/edgeFunctionInvoke";
import { syncProfileToTeamMember } from "@/hooks/useSyncProfileTeamMember";
import { getAllModules } from "@/lib/modules";
import { PermissionsSelector } from "@/components/forms/PermissionsSelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Role labels are now dynamic via useTerminology hook
// Mapping from role key to terminology key
const roleTerminologyKeys: Record<UserRole, string> = {
  owner: "role_owner",
  team_manager: "role_team_manager",
  campaigner: "role_campaigner",
  sales_person: "role_sales_person",
  super_admin: "role_super_admin",
  seo: "role_seo",
};

export default function Users() {
  const { isOwner, isSuperAdmin, userId: currentUserId } = useUserRole();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { t } = useTerminology();
  const { setViewAs } = useViewAs();
  const { setSelectedAgency } = useAgency();
  const { buildPath } = useTenantPath();
  const navigate = useNavigate();
  // Helper function to get role label using terminology
  const getRoleLabel = (role: UserRole): string => {
    const key = roleTerminologyKeys[role];
    return key ? t(key) : role;
  };

  // Generate role labels object dynamically for dropdown usage
  const roleLabels: Record<UserRole, string> = {
    owner: getRoleLabel("owner"),
    team_manager: getRoleLabel("team_manager"),
    campaigner: getRoleLabel("campaigner"),
    sales_person: getRoleLabel("sales_person"),
    super_admin: getRoleLabel("super_admin"),
    seo: getRoleLabel("seo"),
  };
  const [isTenantDialogOpen, setIsTenantDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("campaigner");
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<Array<string>>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([
    "dashboard",
    "clients",
    "tasks",
    "chat",
    "time_tracking",
  ]); // Default modules for campaigner
  const [selectedCampaignerId, setSelectedCampaignerId] = useState<string>("");
  const [selectedSalesPersonId, setSelectedSalesPersonId] =
    useState<string>("");
  const [editAgenciesUserId, setEditAgenciesUserId] = useState<string | null>(
    null,
  );
  const [editAgenciesUserEmail, setEditAgenciesUserEmail] =
    useState<string>("");
  const [editPermissionsUserId, setEditPermissionsUserId] = useState<
    string | null
  >(null);
  const [editPermissionsUserEmail, setEditPermissionsUserEmail] =
    useState<string>("");
  const [editNameUserId, setEditNameUserId] = useState<string | null>(null);
  const [editNameUserEmail, setEditNameUserEmail] = useState<string>("");
  const [editNameUserFullName, setEditNameUserFullName] = useState<string>("");
  const [editSalesPersonAgencies, setEditSalesPersonAgencies] = useState<{
    id: string;
    full_name: string;
    agencies: Array<{ id: string; name: string }>;
  } | null>(null);
  const [editManagedAgenciesUser, setEditManagedAgenciesUser] = useState<{
    id: string;
    full_name: string;
    managed_agencies: Array<{ id: string; name: string }>;
  } | null>(null);
  const [selectedInviteTenantIds, setSelectedInviteTenantIds] = useState<
    string[]
  >([]);
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(
    null,
  );
  const [resetPasswordUserEmail, setResetPasswordUserEmail] =
    useState<string>("");
  const { tenantId, tenant: currentTenant } = useCurrentTenant();

  const { data: agencies } = useQuery({
    queryKey: ["agencies-for-invite", tenantId, currentUserId],
    queryFn: async () => {
      if (!tenantId) return [] as any[];

      // Get owned agencies
      const { data: ownedAgencies, error: ownedError } = await supabase
        .from("agencies")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");

      if (ownedError) throw ownedError;

      // Get shared agencies via agency_tenant_access
      const { data: sharedAccess, error: sharedError } = await supabase
        .from("agency_tenant_access")
        .select(
          `
          agency_id,
          agencies (
            id,
            name,
            status,
            contact_name,
            phone,
            email,
            start_date,
            notes,
            created_at,
            tenant_id
          )
        `,
        )
        .eq("accessing_tenant_id", tenantId);

      if (sharedError) throw sharedError;

      // Extract shared agencies
      const shared = (sharedAccess || [])
        .map((s) => s.agencies)
        .filter(Boolean);

      // Combine and remove duplicates
      const combined = [...(ownedAgencies || []), ...shared];
      const uniqueMap = new Map();
      combined.forEach((agency) => {
        if (agency && agency.id && !uniqueMap.has(agency.id)) {
          uniqueMap.set(agency.id, agency);
        }
      });

      return Array.from(uniqueMap.values()).sort((a: any, b: any) =>
        a.name.localeCompare(b.name, "he"),
      );
    },
    enabled: !!tenantId,
  });

  const { data: campaigners } = useQuery({
    queryKey: ["campaigners-for-invite", tenantId],
    queryFn: async () => {
      if (!tenantId) return [] as any[];
      const { data, error } = await supabase
        .from("campaigners")
        .select("id, full_name")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: salesPeople } = useQuery({
    queryKey: ["sales-people-for-invite", tenantId],
    queryFn: async () => {
      if (!tenantId) return [] as any[];
      const { data, error } = await supabase
        .from("sales_people")
        .select("id, full_name")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .order("full_name");
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const { data: salesPeopleWithAgencies } = useQuery({
    queryKey: ["sales-people-with-agencies", tenantId],
    queryFn: async () => {
      if (!tenantId) return [] as any[];
      const { data, error } = await supabase
        .from("sales_people")
        .select(
          `
          id,
          full_name,
          sales_person_agencies(
            agency_id,
            agencies(id, name)
          )
        `,
        )
        .eq("tenant_id", tenantId);

      if (error) throw error;

      return data.map((sp: any) => ({
        id: sp.id,
        full_name: sp.full_name,
        agencies: sp.sales_person_agencies
          .map((spa: any) => spa.agencies)
          .filter(Boolean),
      }));
    },
    enabled: !!tenantId,
  });

  // Query for user_managed_agencies to show in dialog
  const { data: userManagedAgencies } = useQuery({
    queryKey: ["user-managed-agencies", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase.from("user_managed_agencies")
        .select(`
          user_id,
          agency_id,
          agencies (id, name)
        `);

      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const { data: tenants } = useQuery({
    queryKey: ["tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin,
  });

  const { data: ownerTenants } = useQuery({
    queryKey: ["owner-tenants-for-invite", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];
      const { data, error } = await supabase
        .from("tenant_users")
        .select("tenant_id, tenants(id, name)")
        .eq("user_id", currentUserId);
      if (error) throw error;
      return (data || []).map((row: any) => row.tenants).filter(Boolean);
    },
    enabled: !!currentUserId && !isSuperAdmin,
  });

  const inviteTenantOptions = isSuperAdmin
    ? (tenants || []).map((t) => ({ id: t.id, name: t.name }))
    : (ownerTenants || []).map((t: any) => ({ id: t.id, name: t.name }));

  const showMultiTenantInvite = inviteTenantOptions.length > 1 || isSuperAdmin;
  // Clients can be assigned only in the current organization: the invite
  // sends clientIds to that tenant alone, so hide the picker when it is unselected.
  const invitesCurrentTenant =
    !showMultiTenantInvite ||
    (!!tenantId && selectedInviteTenantIds.includes(tenantId));

  useEffect(() => {
    if (isInviteDialogOpen && tenantId) {
      setSelectedInviteTenantIds([tenantId]);
    }
  }, [isInviteDialogOpen, tenantId]);

  const { data: users, isLoading } = useQuery({
    queryKey: ["users-with-roles", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];

      // Strict tenant isolation: only users explicitly in tenant_users for this org.
      // Cross-tenant staff (shared agencies) appear in team/clients/tasks — not here.
      const { data: tenantUsers, error: tenantUsersError } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenantId);

      if (tenantUsersError) throw tenantUsersError;

      const tenantUserIdsArr = (tenantUsers || []).map((tu) => tu.user_id);
      if (tenantUserIdsArr.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select(
          `
          id, 
          email, 
          full_name, 
          status, 
          campaigner_id, 
          sales_person_id, 
          campaigners!profiles_campaigner_id_fkey(full_name), 
          sales_people!profiles_sales_person_id_fkey(full_name)
        `,
        )
        .in("id", tenantUserIdsArr);

      if (profilesError) throw profilesError;

      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role, tenant_id")
        .eq("tenant_id", tenantId);

      if (rolesError) throw rolesError;

      // Get campaigner agencies
      const { data: campaignerAgencies } = await supabase
        .from("campaigner_agencies")
        .select("campaigner_id, agency_id");

      // Get sales person agencies
      const { data: salesPersonAgencies } = await supabase
        .from("sales_person_agencies")
        .select("sales_person_id, agency_id");

      return profiles.map((profile: any) => {
        const userRoleRecords = (userRoles || []).filter(
          (r) => r.user_id === profile.id,
        );
        const roles = [
          ...new Set(userRoleRecords.map((r) => r.role as UserRole)),
        ];

        // Get agencies for this user
        const userAgencyIds: string[] = [];
        if (profile.campaigner_id) {
          const campaignerAgencyIds =
            campaignerAgencies
              ?.filter((ca) => ca.campaigner_id === profile.campaigner_id)
              .map((ca) => ca.agency_id) || [];
          userAgencyIds.push(...campaignerAgencyIds);
        }
        if (profile.sales_person_id) {
          const salesAgencyIds =
            salesPersonAgencies
              ?.filter((spa) => spa.sales_person_id === profile.sales_person_id)
              .map((spa) => spa.agency_id) || [];
          userAgencyIds.push(...salesAgencyIds);
        }

        return {
          ...profile,
          roles,
          role: roles[0],
          campaigner_name: profile.campaigners?.full_name,
          sales_person_name: profile.sales_people?.full_name,
          agency_ids: [...new Set(userAgencyIds)],
        };
      });
    },
  });

  const tenantAgencyIdSet = new Set((agencies || []).map((a: any) => a.id));

  const organizationUsers = (users || []).map((user) => ({
    ...user,
    agency_ids: (user.agency_ids || []).filter((id: string) =>
      tenantAgencyIdSet.has(id),
    ),
  }));

  const filteredUsers = (() => {
    const seen = new Set<string>();
    const term = userSearchTerm.trim().toLowerCase();
    return organizationUsers.filter((user) => {
      if (agencyFilter !== "all" && !user.agency_ids?.includes(agencyFilter))
        return false;
      if (term) {
        const hay = `${user.full_name || ""} ${user.email || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
  })();

  const userListFilters = (
    <div className="mb-4 flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-center">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full sm:w-auto">
        <Label className="text-sm font-medium shrink-0">סנן לפי סוכנות:</Label>
        <Select value={agencyFilter} onValueChange={setAgencyFilter}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue placeholder="כל הסוכנויות" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">כל הסוכנויות</SelectItem>
            {agencies?.map((agency) => (
              <SelectItem key={agency.id} value={agency.id}>
                {agency.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full sm:flex-1 sm:max-w-xs">
        <Label className="text-sm font-medium shrink-0">חיפוש:</Label>
        <Input
          value={userSearchTerm}
          onChange={(e) => setUserSearchTerm(e.target.value)}
          placeholder="שם או אימייל..."
          className="w-full"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {filteredUsers.length} משתמשים ב{currentTenant?.name || "ארגון"}
      </p>
    </div>
  );

  const addRoleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: UserRole;
    }) => {
      if (!tenantId) throw new Error("No tenant selected");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const { data, error } = await supabase.functions.invoke(
        "manage-user-roles",
        {
          body: { userId, role, tenantId, action: "add" },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["users-with-roles", tenantId],
      });
      await queryClient.refetchQueries({
        queryKey: ["users-with-roles", tenantId],
      });
      toast.success("התפקיד נוסף בהצלחה");
    },
    onError: (error: Error) => {
      toast.error("שגיאה בהוספת תפקיד: " + error.message);
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: async ({
      userId,
      role,
    }: {
      userId: string;
      role: UserRole;
    }) => {
      if (!tenantId) throw new Error("No tenant selected");

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("No active session");

      const { data, error } = await supabase.functions.invoke(
        "manage-user-roles",
        {
          body: { userId, role, tenantId, action: "remove" },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["users-with-roles", tenantId],
      });
      await queryClient.refetchQueries({
        queryKey: ["users-with-roles", tenantId],
      });
      toast.success("התפקיד הוסר בהצלחה");
    },
    onError: (error: Error) => {
      toast.error("שגיאה בהסרת תפקיד: " + error.message);
    },
  });

  const updateCampaignerMutation = useMutation({
    mutationFn: async ({
      userId,
      campaignerId,
    }: {
      userId: string;
      campaignerId: string | null;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ campaigner_id: campaignerId })
        .eq("id", userId);

      if (error) throw error;

      if (campaignerId) {
        await syncProfileToTeamMember(userId);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["users-with-roles", tenantId],
      });
      await queryClient.refetchQueries({
        queryKey: ["users-with-roles", tenantId],
      });
      toast.success("קמפיינר עודכן בהצלחה");
    },
    onError: (error: Error) => {
      toast.error("שגיאה בעדכון קמפיינר: " + error.message);
    },
  });

  const updateSalesPersonMutation = useMutation({
    mutationFn: async ({
      userId,
      salesPersonId,
    }: {
      userId: string;
      salesPersonId: string | null;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ sales_person_id: salesPersonId })
        .eq("id", userId);

      if (error) throw error;

      if (salesPersonId) {
        await syncProfileToTeamMember(userId);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["users-with-roles", tenantId],
      });
      await queryClient.refetchQueries({
        queryKey: ["users-with-roles", tenantId],
      });
      toast.success("איש מכירות עודכן בהצלחה");
    },
    onError: (error: Error) => {
      toast.error("שגיאה בעדכון איש מכירות: " + error.message);
    },
  });

  const { data: currentUserTenant } = useQuery({
    queryKey: ["current-user-tenant", currentUserId],
    queryFn: async () => {
      if (!currentUserId) return null;

      const { data, error } = await supabase
        .from("tenant_users")
        .select("tenant_id, tenants(name, allow_super_admin_access)")
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!currentUserId && !isSuperAdmin,
  });

  // Check if current user is owner (from user_roles table)
  const { data: canManageSuperAdminAccess } = useQuery({
    queryKey: [
      "can-manage-super-admin-access",
      tenantId,
      currentUserId,
      isOwner,
    ],
    queryFn: async () => {
      if (!tenantId || !currentUserId) return false;
      // Check membership in this tenant
      const { data: membership, error } = await supabase
        .from("tenant_users")
        .select("role")
        .eq("user_id", currentUserId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) {
        console.error("Error checking tenant membership:", error);
        return false;
      }
      if (!membership) return false;
      // Owner of tenant OR global owner with membership
      return membership.role === "owner" || isOwner;
    },
    enabled: !!tenantId && !!currentUserId,
  });

  // Load current tenant details for the switch state
  const { data: currentTenantDetails } = useQuery({
    queryKey: ["tenant-details", tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from("tenants")
        .select("id, name, allow_super_admin_access")
        .eq("id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const updateSuperAdminAccessMutation = useMutation({
    mutationFn: async ({ allowAccess }: { allowAccess: boolean }) => {
      if (!tenantId) throw new Error("No tenant selected");

      const { error } = await supabase
        .from("tenants")
        .update({ allow_super_admin_access: allowAccess })
        .eq("id", tenantId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-details", tenantId] });
      toast.success("הגדרות גישת Super Admin עודכנו בהצלחה");
    },
    onError: (error) => {
      toast.error("שגיאה בעדכון הגדרות גישה: " + error.message);
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: async ({
      email,
      fullName,
      role,
      agencyIds,
      clientIds,
      modulePermissions,
      campaignerId,
      salesPersonId,
    }: {
      email: string;
      fullName?: string;
      role: UserRole;
      agencyIds: string[];
      clientIds: Array<string>;
      modulePermissions: string[];
      campaignerId?: string;
      salesPersonId?: string;
    }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("No active session");
      }

      // Resolve tenant list — current org first, then additional selections
      let inviteTenantIds: string[];
      if (isSuperAdmin || showMultiTenantInvite) {
        if (selectedInviteTenantIds.length === 0) {
          throw new Error("יש לבחור לפחות ארגון אחד");
        }
        inviteTenantIds = [
          ...(tenantId && selectedInviteTenantIds.includes(tenantId)
            ? [tenantId]
            : []),
          ...selectedInviteTenantIds.filter((id) => id !== tenantId),
        ];
      } else {
        const singleTenantId = currentUserTenant?.tenant_id || tenantId;
        if (!singleTenantId) throw new Error("לא נמצא ארגון פעיל");
        inviteTenantIds = [singleTenantId];
      }

      const results: Array<{
        tenantId: string;
        success: boolean;
        error?: string;
      }> = [];
      let emailSent = false;
      let addedCount = 0;

      for (const targetTenantId of inviteTenantIds) {
        const isPrimaryTenant = targetTenantId === tenantId;

        const { data, error } = await supabase.functions.invoke("invite-user", {
          body: {
            email,
            fullName,
            role,
            agencyIds: isPrimaryTenant ? agencyIds : [],
            clientIds: isPrimaryTenant ? clientIds : [],
            modulePermissions,
            campaignerId: isPrimaryTenant ? campaignerId : undefined,
            salesPersonId: isPrimaryTenant ? salesPersonId : undefined,
            tenantId: targetTenantId,
            baseUrl: window.location.origin,
            skipEmail: emailSent,
            updateProfileTeamLinks: isPrimaryTenant,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (error) throw error;

        if (data.error === "EMAIL_EXISTS_IN_TENANT") {
          results.push({
            tenantId: targetTenantId,
            success: false,
            error: data.error,
          });
          continue;
        }

        if (!data.success) {
          throw new Error(data.error || data.message || "שגיאה לא ידועה");
        }

        results.push({ tenantId: targetTenantId, success: true });
        addedCount++;
        if (data.emailSent) emailSent = true;
      }

      if (addedCount === 0) {
        throw new Error("EMAIL_EXISTS");
      }

      return {
        results,
        emailSent,
        addedCount,
        invitationLink: `${window.location.origin}/auth`,
      };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({
        queryKey: ["users-with-roles", tenantId],
      });
      await queryClient.refetchQueries({
        queryKey: ["users-with-roles", tenantId],
      });

      if (data.addedCount > 1) {
        toast.success(
          `המשתמש נוסף ל-${data.addedCount} ארגונים${data.emailSent ? " ומייל הזמנה נשלח" : ""}`,
        );
      } else if (data.emailSent) {
        toast.success("הזמנה נשלחה בהצלחה למייל המשתמש");
      } else {
        toast.success("המשתמש נוסף לארגון בהצלחה");
      }

      setIsInviteDialogOpen(false);
      setInviteEmail("");
      setInviteFullName("");
      setInviteRole("campaigner");
      setSelectedAgencies([]);
      setSelectedClientIds([]);
      setSelectedModules([
        "dashboard",
        "clients",
        "tasks",
        "chat",
        "time_tracking",
      ]);
      setSelectedCampaignerId("");
      setSelectedSalesPersonId("");
      if (tenantId) setSelectedInviteTenantIds([tenantId]);
    },
    onError: (error: Error) => {
      if (error.message === "EMAIL_EXISTS") {
        toast.error("המשתמש כבר רשום במערכת", {
          action: {
            label: "מחק משתמש קיים",
            onClick: () => {
              if (window.confirm(`האם להסיר את ${inviteEmail} מהארגון?`)) {
                deleteUserMutation.mutate({ email: inviteEmail });
              }
            },
          },
        });
      } else {
        toast.error("שגיאה בשליחת הזמנה: " + error.message);
      }
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async ({
      userId,
      email,
    }: {
      userId?: string;
      email?: string;
    }) => {
      const removeTenantId = tenantId || currentUserTenant?.tenant_id;
      if (!removeTenantId) throw new Error("לא נמצא ארגון פעיל");

      return invokeEdgeFunction<DeleteMemberResult>("delete-user", {
        userId,
        email,
        tenantId: removeTenantId,
      });
    },
    onSuccess: async (result) => {
      await Promise.all(
        MEMBER_LIST_KEYS.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      toast.success(
        result.accountDeleted
          ? "המשתמש נמחק; העדכונים שלו נשארים בהיסטוריה"
          : "המשתמש הוסר מהארגון; העדכונים שלו נשארים בהיסטוריה",
      );
    },
    onError: (error: Error) => {
      toast.error("שגיאה במחיקת משתמש: " + error.message);
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async ({ email }: { email: string }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("No active session");
      }

      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          email,
          resend: true,
          tenantId: tenantId || currentUserTenant?.tenant_id,
          baseUrl: window.location.origin,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      return data;
    },
    onSuccess: (data) => {
      // Show success message with invitation link if available
      if (data.invitationLink) {
        toast.success(`הזמנה נשלחה מחדש! לינק ההזמנה: ${data.invitationLink}`);
      } else {
        toast.success("הזמנה נשלחה מחדש בהצלחה");
      }
    },
    onError: (error: Error) => {
      toast.error("שגיאה בשליחת הזמנה מחדש: " + error.message);
    },
  });

  /** Team managers edit the agencies they manage; everyone else edits team-card agencies. */
  function openAgenciesDialog(user: ManagedUser) {
    if (!user.roles.includes("team_manager")) {
      setEditAgenciesUserId(user.id);
      setEditAgenciesUserEmail(user.email);
      return;
    }
    const managedAgencies = (userManagedAgencies || [])
      .filter((uma) => uma.user_id === user.id)
      .map((uma) => uma.agencies)
      .filter((agency) => agency !== null);
    setEditManagedAgenciesUser({
      id: user.id,
      full_name: user.full_name || user.email,
      managed_agencies: managedAgencies,
    });
  }

  /** Super admins preview any user; owners keep the legacy sales-person preview only. */
  function startViewAs(user: ManagedUser) {
    const name = user.full_name || user.email;
    setViewAs(user.id, user.sales_person_id || null, name);
    setSelectedAgency("all");
    toast.success(`עובר למצב צפייה בתור ${name}`);
    navigate(
      buildPath(
        user.sales_person_id && !user.campaigner_id ? "leads" : "clients",
      ),
    );
  }

  const usersListProps: UsersListProps = {
    users: filteredUsers,
    roleLabels,
    campaigners: campaigners || [],
    salesPeople: salesPeople || [],
    salesPersonAgencyNames: (user) =>
      (salesPeopleWithAgencies || [])
        .find((sp) => sp.id === user.sales_person_id)
        ?.agencies.map((agency: { name: string }) => agency.name)
        .join(", ") || "",
    canViewAs: (user) => isSuperAdmin || (isOwner && !!user.sales_person_id),
    currentUserId,
    resendPending: resendInviteMutation.isPending,
    deletePending: deleteUserMutation.isPending,
    actions: {
      addRole: (user, role) =>
        addRoleMutation.mutate({ userId: user.id, role }),
      removeRole: (user, role) =>
        removeRoleMutation.mutate({ userId: user.id, role }),
      setCampaigner: (user, campaignerId) =>
        updateCampaignerMutation.mutate({ userId: user.id, campaignerId }),
      setSalesPerson: (user, salesPersonId) =>
        updateSalesPersonMutation.mutate({ userId: user.id, salesPersonId }),
      editName: (user) => {
        setEditNameUserId(user.id);
        setEditNameUserEmail(user.email);
        setEditNameUserFullName(user.full_name || "");
      },
      editAgencies: openAgenciesDialog,
      editSalesPersonAgencies: (user) => {
        const salesPerson = salesPeopleWithAgencies?.find(
          (sp) => sp.id === user.sales_person_id,
        );
        if (salesPerson) {
          setEditSalesPersonAgencies(salesPerson);
        }
      },
      editPermissions: (user) => {
        setEditPermissionsUserId(user.id);
        setEditPermissionsUserEmail(user.email);
      },
      resetPassword: (user) => {
        setResetPasswordUserId(user.id);
        setResetPasswordUserEmail(user.email);
      },
      viewAs: startViewAs,
      resendInvite: (user) =>
        resendInviteMutation.mutate({ email: user.email }),
      deleteUser: (user) => deleteUserMutation.mutate({ userId: user.id }),
    },
  };

  if (!isOwner && !isSuperAdmin) {
    return (
      <div className="container mx-auto py-6">
        <Card className="p-6">
          <div className="text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">אין הרשאה</h2>
            <p className="text-muted-foreground">
              רק בעלים ומנהלי סוכנות יכולים לגשת לדף זה
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Block super admin when owner disabled access for this tenant
  if (
    isSuperAdmin &&
    currentTenantDetails &&
    currentTenantDetails.allow_super_admin_access === false &&
    !canManageSuperAdminAccess
  ) {
    return (
      <div className="container mx-auto py-6">
        <Card className="p-6">
          <div className="text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">הגישה נחסמה</h2>
            <p className="text-muted-foreground">
              בעלים חסם גישת Super Admin לארגון זה. בחר ארגון אחר מהרשימה.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="container mx-auto py-4 md:py-6 px-4 md:px-6 space-y-4 md:space-y-6"
      dir="rtl"
    >
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold">
            ניהול משתמשים
            {currentTenant?.name ? ` — ${currentTenant.name}` : ""}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            {isSuperAdmin
              ? "ניהול ארגונים ומשתמשים במערכת SaaS"
              : isMobile
                ? `רק משתמשים רשומים ב-${currentTenant?.name || "ארגון שלך"}`
                : `ניהול גישות והרשאות — רק משתמשים ששייכים ל"${currentTenant?.name || "ארגון שלך"}". צוות מסוכנות משותפות מופיע בלקוחות/משימות, לא כאן.`}
          </p>

          {/* Super Admin Access Control */}
          {canManageSuperAdminAccess && (
            <Card className="mt-4 p-4 bg-muted/50">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-1">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <Label
                      htmlFor="super-admin-access"
                      className="text-sm font-medium cursor-pointer"
                    >
                      אפשר גישת Super Admin לארגון
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      קובע אם Super Admin יכול לצפות ולערוך נתונים בארגון שלך
                    </p>
                  </div>
                </div>
                <Switch
                  id="super-admin-access"
                  checked={
                    currentTenantDetails?.allow_super_admin_access ?? true
                  }
                  onCheckedChange={(checked) => {
                    updateSuperAdminAccessMutation.mutate({
                      allowAccess: !!checked,
                    });
                  }}
                />
              </div>
            </Card>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto md:flex-shrink-0">
          {isSuperAdmin && (
            <Dialog
              open={isTenantDialogOpen}
              onOpenChange={setIsTenantDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  <Building2 className="h-4 w-4 ml-2" />
                  הוסף ארגון
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>הוסף ארגון חדש</DialogTitle>
                  <DialogDescription>
                    צור ארגון חדש במערכת. יהיה צורך ליצור משתמשים עבורו בנפרד.
                  </DialogDescription>
                </DialogHeader>
                <AddTenantForm
                  asDialog={false}
                  onSuccess={() => setIsTenantDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          )}

          <Dialog
            open={isInviteDialogOpen}
            onOpenChange={setIsInviteDialogOpen}
          >
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <UserPlus className="h-4 w-4 ml-2" />
                הזמן משתמש חדש
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>הזמן משתמש חדש לארגון שלך</DialogTitle>
                <DialogDescription>
                  המשתמש יקבל מייל מ-AIOS עם קישור ליצירת חשבון והצטרפות לארגון.
                  אם בוחרים איש צוות קיים, המשתמש משויך אליו. בלי בחירה, כרטיס
                  עם אותו אימייל משויך למשתמש, ואחרת נוצרת רשומה חדשה במודול
                  אנשי צוות.
                </DialogDescription>
              </DialogHeader>
              {/* One scroll area between the fixed header and footer: nested
                  scroll boxes trapped touch scrolling on phones. */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-6 px-6">
                <div
                  className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  dir="rtl"
                >
                  {showMultiTenantInvite && (
                    <div className="md:col-span-2 p-3 border border-amber-500 bg-amber-50 dark:bg-amber-950 rounded-md">
                      <Label className="text-amber-900 dark:text-amber-100 font-semibold">
                        ארגונים להזמנה
                      </Label>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 mb-2">
                        הארגון שאתה נמצא בו ({currentTenant?.name || "נוכחי"})
                        מסומן כברירת מחדל. סמן ארגונים נוספים להזמנה מרובה.
                      </p>
                      <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto bg-background">
                        {inviteTenantOptions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            אין ארגונים זמינים
                          </p>
                        ) : (
                          inviteTenantOptions.map((org) => (
                            <div
                              key={org.id}
                              className="flex items-center space-x-2 space-x-reverse"
                            >
                              <input
                                type="checkbox"
                                id={`invite-tenant-${org.id}`}
                                checked={selectedInviteTenantIds.includes(
                                  org.id,
                                )}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedInviteTenantIds([
                                      ...selectedInviteTenantIds,
                                      org.id,
                                    ]);
                                  } else {
                                    setSelectedInviteTenantIds(
                                      selectedInviteTenantIds.filter(
                                        (id) => id !== org.id,
                                      ),
                                    );
                                  }
                                }}
                                className="rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <label
                                htmlFor={`invite-tenant-${org.id}`}
                                className="text-sm font-medium cursor-pointer flex items-center gap-2"
                              >
                                {org.name}
                                {org.id === tenantId && (
                                  <Badge variant="outline" className="text-xs">
                                    נוכחי
                                  </Badge>
                                )}
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                      {selectedInviteTenantIds.length > 0 && (
                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                          נבחרו {selectedInviteTenantIds.length} ארגונים
                        </p>
                      )}
                    </div>
                  )}
                  <div>
                    <Label htmlFor="invite-email">אימייל משתמש</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="invite-full-name">שם מלא (אופציונלי)</Label>
                    <Input
                      id="invite-full-name"
                      type="text"
                      value={inviteFullName}
                      onChange={(e) => setInviteFullName(e.target.value)}
                      placeholder="שם מלא של המשתמש"
                    />
                  </div>
                  <div>
                    <Label htmlFor="invite-role">תפקיד</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(value) => {
                        const newRole = value as UserRole;
                        setInviteRole(newRole);
                        setSelectedAgencies([]);
                        setSelectedClientIds([]);
                        setSelectedCampaignerId("");
                        setSelectedSalesPersonId("");

                        // *** FIX: Set default modules based on role ***
                        if (newRole === "campaigner") {
                          // Campaigners get basic modules + dynamic tables for their clients
                          setSelectedModules([
                            "dashboard",
                            "clients",
                            "tasks",
                            "chat",
                            "time_tracking",
                            "dynamic_tables",
                          ]);
                        } else if (newRole === "sales_person") {
                          // Sales people get sales modules
                          setSelectedModules([
                            "dashboard",
                            "leads",
                            "sales_dashboard",
                            "products",
                            "chat",
                          ]);
                        } else if (newRole === "team_manager") {
                          // Team managers get more access including dynamic tables & dashboards
                          setSelectedModules([
                            "dashboard",
                            "clients",
                            "tasks",
                            "campaigners",
                            "reports",
                            "client_onboarding",
                            "chat",
                            "time_tracking",
                            "dynamic_tables",
                          ]);
                        } else if (newRole === "seo") {
                          // SEO gets specific modules
                          setSelectedModules([
                            "dashboard",
                            "clients",
                            "tasks",
                            "time_tracking",
                          ]);
                        } else if (newRole === "owner") {
                          // Owners get all modules
                          setSelectedModules(getAllModules().map((m) => m.id));
                        } else {
                          // Other roles start with empty selection
                          setSelectedModules([]);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(roleLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {inviteRole !== "campaigner" &&
                    inviteRole !== "sales_person" && (
                      <div>
                        <Label htmlFor="campaigner">איש צוות (אופציונלי)</Label>
                        <Select
                          value={selectedCampaignerId || "none"}
                          onValueChange={(value) =>
                            setSelectedCampaignerId(
                              value === "none" ? "" : value,
                            )
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="בחר קמפיינר" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">ללא שיוך</SelectItem>
                            {campaigners?.map((campaigner) => (
                              <SelectItem
                                key={campaigner.id}
                                value={campaigner.id}
                              >
                                {campaigner.full_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground mt-1">
                          בלי בחירה ידנית, משתמש חדש משויך לכרטיס שכבר נושא את
                          האימייל שלו, או שנוצרת לו רשומה במודול אנשי צוות. שיוך
                          ידני לאיש צוות קיים גובר.
                        </p>
                      </div>
                    )}

                  {(inviteRole === "campaigner" ||
                    inviteRole === "sales_person") && (
                    <div className="md:col-span-2 p-3 border rounded-md bg-muted/40">
                      <p className="text-sm text-muted-foreground">
                        {inviteRole === "campaigner"
                          ? "אם כבר יש איש צוות עם האימייל הזה, המשתמש משויך אליו. אם אין, תיווצר רשומה חדשה במודול אנשי צוות."
                          : "אם כבר יש איש מכירות עם האימייל הזה, המשתמש משויך אליו. אם אין, תיווצר רשומה חדשה."}
                      </p>
                    </div>
                  )}

                  {/* Sales Person Selection — only when role is not sales_person */}
                  {inviteRole !== "sales_person" && (
                    <div>
                      <Label htmlFor="sales-person">
                        איש מכירות משויך (אופציונלי)
                      </Label>
                      <Select
                        value={selectedSalesPersonId || "none"}
                        onValueChange={(value) =>
                          setSelectedSalesPersonId(
                            value === "none" ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="בחר איש מכירות" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">ללא שיוך</SelectItem>
                          {salesPeople?.map((salesPerson) => (
                            <SelectItem
                              key={salesPerson.id}
                              value={salesPerson.id}
                            >
                              {salesPerson.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <Label>סוכנויות</Label>
                    <div className="border rounded-md p-3 space-y-2 max-h-32 overflow-y-auto">
                      {agencies?.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          אין סוכנויות זמינות
                        </p>
                      ) : (
                        agencies?.map((agency) => (
                          <div
                            key={agency.id}
                            className="flex items-center space-x-2 space-x-reverse"
                          >
                            <input
                              type="checkbox"
                              id={`agency-${agency.id}`}
                              checked={selectedAgencies.includes(agency.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedAgencies([
                                    ...selectedAgencies,
                                    agency.id,
                                  ]);
                                } else {
                                  setSelectedAgencies(
                                    selectedAgencies.filter(
                                      (id) => id !== agency.id,
                                    ),
                                  );
                                }
                              }}
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <label
                              htmlFor={`agency-${agency.id}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {agency.name}
                            </label>
                          </div>
                        ))
                      )}
                    </div>
                    {selectedAgencies.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        נבחרו {selectedAgencies.length} סוכנויות
                      </p>
                    )}
                  </div>
                  {inviteRole === "campaigner" && invitesCurrentTenant && (
                    <div className="md:col-span-2">
                      <InviteClientsPicker
                        tenantId={tenantId}
                        agencyIds={selectedAgencies}
                        value={selectedClientIds}
                        onChange={setSelectedClientIds}
                      />
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <Label>הרשאות מודולים</Label>
                    <div className="mt-2">
                      <PermissionsSelector
                        value={Object.fromEntries(
                          getAllModules().map((m) => [
                            m.id,
                            selectedModules.includes(m.id),
                          ]),
                        )}
                        onChange={(next) => {
                          setSelectedModules(
                            Object.entries(next)
                              .filter(([, v]) => v)
                              .map(([k]) => k),
                          );
                        }}
                        idPrefix="invite-perms"
                      />
                    </div>
                    {selectedModules.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        נבחרו {selectedModules.length} מודולים
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      מודולים שלא נבחרו יהיו נעולים למשתמש
                    </p>
                  </div>
                </div>
              </div>
              <div className="shrink-0 pt-4 border-t">
                <Button
                  onClick={() =>
                    inviteUserMutation.mutate({
                      email: inviteEmail,
                      fullName: inviteFullName || undefined,
                      role: inviteRole,
                      agencyIds: selectedAgencies,
                      clientIds:
                        inviteRole === "campaigner" && invitesCurrentTenant
                          ? selectedClientIds
                          : [],
                      modulePermissions: selectedModules,
                      campaignerId: selectedCampaignerId || undefined,
                      salesPersonId: selectedSalesPersonId || undefined,
                    })
                  }
                  disabled={
                    !inviteEmail ||
                    inviteUserMutation.isPending ||
                    (showMultiTenantInvite &&
                      selectedInviteTenantIds.length === 0)
                  }
                  className="w-full"
                >
                  {inviteUserMutation.isPending ? "שולח..." : "שלח הזמנה"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isSuperAdmin ? (
        <Tabs defaultValue="users" dir="rtl">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="users" className="text-xs md:text-sm py-2">
              ניהול משתמשים
            </TabsTrigger>
            <TabsTrigger value="tenants" className="text-xs md:text-sm py-2">
              ניהול ארגונים (SaaS)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-4 md:mt-6">
            {userListFilters}
            {isLoading ? (
              <Card className="p-6 text-center">טוען...</Card>
            ) : (
              <UsersList {...usersListProps} />
            )}
          </TabsContent>

          <TabsContent value="tenants" className="mt-6">
            <Card>
              <div className="p-6">
                <h2 className="text-xl font-semibold mb-4">
                  ניהול ארגונים (Tenants)
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  כל ארגון מייצג לקוח SaaS נפרד עם משתמשים ונתונים משלו
                </p>

                {!tenants || tenants.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    אין ארגונים במערכת. לחץ על "הוסף ארגון" כדי להתחיל.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">שם הארגון</TableHead>
                        <TableHead className="text-right">סטטוס</TableHead>
                        <TableHead className="text-right">איש קשר</TableHead>
                        <TableHead className="text-right">
                          תאריך יצירה
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tenants.map((tenant: any) => (
                        <TableRow key={tenant.id}>
                          <TableCell className="font-medium">
                            {tenant.name}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                tenant.status === "active"
                                  ? "default"
                                  : "secondary"
                              }
                            >
                              {tenant.status === "active"
                                ? "פעיל"
                                : tenant.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{tenant.contact_name || "-"}</TableCell>
                          <TableCell>
                            {new Date(tenant.created_at).toLocaleDateString(
                              "he-IL",
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      ) : isLoading ? (
        <Card className="p-6 text-center">טוען...</Card>
      ) : (
        <>
          {userListFilters}
          <UsersList {...usersListProps} />
        </>
      )}

      <InactiveMembersCard />

      <Card className="p-4 md:p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
        <h2 className="text-lg md:text-xl font-semibold mb-2 flex items-center gap-2">
          <Shield className="h-4 md:h-5 w-4 md:w-5" />
          הבנת מערכת הניהול
        </h2>
        <div className="mb-4 md:mb-6 p-3 md:p-4 bg-white dark:bg-gray-900 rounded-lg border">
          <h3 className="font-semibold mb-2 text-sm md:text-base">
            ההבדל בין ניהול משתמשים לניהול ארגונים:
          </h3>
          <ul className="text-xs md:text-sm space-y-2 mr-4">
            <li>
              <strong>• ניהול משתמשים (דף זה):</strong> הוספת עובדים/
              {t("role_campaigner", true)} לארגון שלך. הם לא מקבלים חשבון נפרד,
              אלא נכנסים למערכת שלך.
            </li>
            <li>
              <strong>• ניהול ארגונים (רק {t("role_super_admin")}):</strong>{" "}
              יצירת לקוחות SaaS חדשים שמקבלים חשבון נפרד לחלוטין.
            </li>
          </ul>
        </div>

        <h3 className="text-lg font-semibold mb-3">תפקידים זמינים:</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Badge className={roleBadgeColors.owner}>{roleLabels.owner}</Badge>
            <p className="text-sm text-muted-foreground">
              גישה מלאה למערכת - רואה את כל הסוכנויות והלקוחות, יכול לנהל
              משתמשים ותפקידים
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Badge className={roleBadgeColors.team_manager}>
              {roleLabels.team_manager}
            </Badge>
            <p className="text-sm text-muted-foreground">
              מנהל צוות - רואה רק סוכנויות שמשוייכות אליו דרך קישורים לקמפיינר
              או ניהול ישיר. חייב להיות משויך לקמפיינר פעיל או לסוכנויות
              ספציפיות.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Badge className={roleBadgeColors.team_manager}>
              {roleLabels.team_manager}
            </Badge>
            <p className="text-sm text-muted-foreground">
              מנהל צוות - רואה רק סוכנויות שמשוייכות אליו. חייב להיות משויך
              לקמפיינר פעיל.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <Badge className={roleBadgeColors.campaigner}>
              {roleLabels.campaigner}
            </Badge>
            <p className="text-sm text-muted-foreground">
              קמפיינר - רואה רק סוכנויות ולקוחות שמשוייכים לקמפיינר שלו. חייב
              להיות משויך לקמפיינר פעיל.
            </p>
          </div>
        </div>
      </Card>

      {editAgenciesUserId && (
        <EditUserAgenciesDialog
          open={!!editAgenciesUserId}
          onOpenChange={(open) => {
            if (!open) {
              setEditAgenciesUserId(null);
              setEditAgenciesUserEmail("");
            }
          }}
          userId={editAgenciesUserId}
          userEmail={editAgenciesUserEmail}
        />
      )}

      {editPermissionsUserId && (
        <EditUserPermissionsDialog
          open={!!editPermissionsUserId}
          onOpenChange={(open) => {
            if (!open) {
              setEditPermissionsUserId(null);
              setEditPermissionsUserEmail("");
            }
          }}
          userId={editPermissionsUserId}
          userEmail={editPermissionsUserEmail}
        />
      )}

      {editNameUserId && (
        <EditUserNameDialog
          userId={editNameUserId}
          userEmail={editNameUserEmail}
          currentFullName={editNameUserFullName}
          onClose={() => {
            setEditNameUserId(null);
            setEditNameUserEmail("");
            setEditNameUserFullName("");
          }}
        />
      )}

      {resetPasswordUserId && (
        <ResetPasswordDialog
          open={!!resetPasswordUserId}
          onOpenChange={(open) => {
            if (!open) {
              setResetPasswordUserId(null);
              setResetPasswordUserEmail("");
            }
          }}
          userId={resetPasswordUserId}
          userEmail={resetPasswordUserEmail}
        />
      )}

      {editSalesPersonAgencies && (
        <EditSalesPersonAgenciesDialog
          open={!!editSalesPersonAgencies}
          onOpenChange={(open) => {
            if (!open) {
              setEditSalesPersonAgencies(null);
            }
          }}
          salesPerson={editSalesPersonAgencies}
        />
      )}

      {editManagedAgenciesUser && (
        <EditManagedAgenciesDialog
          open={!!editManagedAgenciesUser}
          onOpenChange={(open) => {
            if (!open) {
              setEditManagedAgenciesUser(null);
            }
          }}
          user={editManagedAgenciesUser}
        />
      )}
    </div>
  );
}
