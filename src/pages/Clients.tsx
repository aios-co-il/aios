import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CarmenLoadingScreen } from "@/components/shared/CarmenLoadingScreen";
import { isQueryResolving } from "@/lib/queryUi";
import {
  Users,
  CheckCircle2,
  XCircle,
  Wand2,
  Loader2 as Loader2Icon,
} from "lucide-react";
import { AddClientForm } from "@/components/forms/AddClientForm";
import { ImportClientsSheet } from "@/components/forms/ImportClientsSheet";
import { ImportClientsCSV } from "@/components/forms/ImportClientsCSV";
import { DuplicateClientDialog } from "@/components/forms/DuplicateClientDialog";
import { useAssignableCampaigners } from "@/hooks/useAssignableCampaigners";
import { ClientsChatView } from "@/components/clients/ClientsChatView";
import {
  CLIENT_STATUS_META,
  isClientStatus,
} from "@/components/clients/clientStatusMeta";
import { useAgency } from "@/contexts/AgencyContext";
import { useUserAgencies } from "@/hooks/useUserAgencies";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCustomFieldLabels } from "@/hooks/useCustomFieldLabels";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isSeoTaggedClient } from "@/lib/seoClients";
import { CLIENT_LIST_SELECT } from "@/lib/clientListSelect";
import {
  CLEARED_CLIENT_FILTERS,
  DEFAULT_CLIENT_FILTERS,
  activeClientFilterCount,
  applyClientFilters,
  type ClientFilters,
} from "@/components/ClientsPage/clientFilters";
import { ClientsPageHeader } from "@/components/ClientsPage/ClientsPageHeader";
import { ClientsKpiStrip } from "@/components/ClientsPage/ClientsKpiStrip";
import { ClientsToolbar } from "@/components/ClientsPage/ClientsToolbar";
import { ClientsFiltersDialog } from "@/components/ClientsPage/ClientsFiltersDialog";
import {
  ClientsViewToggle,
  type ClientsViewMode,
} from "@/components/ClientsPage/ClientsViewToggle";
import { ClientsImportExportMenu } from "@/components/ClientsPage/ClientsImportExportMenu";
import { ClientGridCard } from "@/components/ClientsPage/ClientGridCard";
import { ClientsTable } from "@/components/ClientsPage/ClientsTable";
import { useClientRowMutations } from "@/components/ClientsPage/useClientRowMutations";
import { cn } from "@/lib/utils";

export default function Clients() {
  const { selectedAgency } = useAgency();
  const { userAgencyIds } = useUserAgencies();
  const { canViewFinance, financeAccessReady } = useUserPermissions();
  const {
    campaignerId,
    isCampaigner,
    isSeo,
    isTeamManager,
    isOwner,
    isSuperAdmin,
  } = useUserRole();
  // SEO viewer takes precedence over campaigner: any user with SEO role sees all SEO-tagged clients
  // (unless they're also team_manager / owner / super_admin who already see everything)
  const isSeoOnlyViewer = isSeo && !isTeamManager && !isOwner && !isSuperAdmin;
  // Restricted viewer: pure campaigner (no SEO / team_manager / owner / super_admin)
  const isRestrictedClientViewer =
    isCampaigner &&
    !isSeoOnlyViewer &&
    !isTeamManager &&
    !isOwner &&
    !isSuperAdmin;
  // Deep-link support: ?clientId=xxx&tab=updates (from DMMDashboard navigation)
  const [searchParams] = useSearchParams();
  const deepLinkClientId = searchParams.get("clientId") ?? undefined;
  const deepLinkTab =
    (searchParams.get("tab") as "updates" | "details" | undefined) ?? undefined;
  const [viewMode, setViewMode] = useState<ClientsViewMode>("chat");
  const [pendingChatClientId, setPendingChatClientId] = useState<string | null>(
    null,
  );

  // Editing a client opens the chat view focused on that client, instead of a modal dialog.
  const openClientInChat = (clientId: string) => {
    setPendingChatClientId(clientId);
    setViewMode("chat");
  };

  const [filters, setFilters] = useState<ClientFilters>(DEFAULT_CLIENT_FILTERS);
  /** Sets one list filter. */
  function setFilter<K extends keyof ClientFilters>(
    key: K,
    value: ClientFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  const [deletingClient, setDeletingClient] = useState<any>(null);
  const [duplicatingClient, setDuplicatingClient] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const { tenantId } = useCurrentTenant();
  const { getFieldLabel } = useCustomFieldLabels("client");
  const rowMutations = useClientRowMutations(tenantId);
  const [showFiltersDialog, setShowFiltersDialog] = useState(false);
  const [showImportCSV, setShowImportCSV] = useState(false);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);

  // Bulk Meta page sync
  const [showBulkMetaSync, setShowBulkMetaSync] = useState(false);
  const [bulkMetaSyncRunning, setBulkMetaSyncRunning] = useState(false);
  const [bulkMetaSyncResults, setBulkMetaSyncResults] = useState<
    Array<{
      clientId: string;
      clientName: string;
      status: "success" | "error" | "skipped";
      message: string;
    }>
  >([]);

  const runBulkMetaSync = async () => {
    if (!tenantId || !clients) return;
    const withMeta = clients.filter((c: any) => c.meta_ads_account_id?.trim());
    if (withMeta.length === 0) {
      toast.info("אין לקוחות עם Meta Ads Account ID");
      return;
    }
    setBulkMetaSyncRunning(true);
    setBulkMetaSyncResults([]);
    const results: typeof bulkMetaSyncResults = [];
    for (const client of withMeta) {
      try {
        const { data, error } = await supabase.functions.invoke(
          "resolve-meta-page-from-ad-account",
          {
            body: {
              tenant_id: tenantId,
              client_id: client.id,
              ad_account_id: client.meta_ads_account_id,
              auto_upsert: true,
            },
          },
        );
        if (error || data?.error) {
          results.push({
            clientId: client.id,
            clientName: client.name,
            status: "error",
            message: data?.message || error?.message || "שגיאה לא ידועה",
          });
        } else {
          results.push({
            clientId: client.id,
            clientName: client.name,
            status: "success",
            message: `${data.page_name || data.page_id}${data.ig_username ? ` + @${data.ig_username}` : ""}`,
          });
        }
      } catch (err: unknown) {
        results.push({
          clientId: client.id,
          clientName: client.name,
          status: "error",
          message: (err as Error)?.message || "שגיאה",
        });
      }
      setBulkMetaSyncResults([...results]);
    }
    setBulkMetaSyncRunning(false);
    const successCount = results.filter((r) => r.status === "success").length;
    toast.success(`שויכו ${successCount} מתוך ${withMeta.length} לקוחות`);
  };

  const activeFilterCount = activeClientFilterCount(filters);

  // Fetch agencies (owned + shared) first for client scoping
  const { data: agencies } = useQuery({
    queryKey: ["agencies", tenantId],
    queryFn: async () => {
      if (!tenantId) return [] as any[];

      // Get owned agencies
      const { data: ownedAgencies, error: ownedError } = await supabase
        .from("agencies")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");

      if (ownedError) throw ownedError;

      // Get shared agencies via agency_tenant_access
      const { data: sharedAccess, error: sharedError } = await supabase
        .from("agency_tenant_access")
        .select("agency_id, agencies(id, name)")
        .eq("accessing_tenant_id", tenantId);

      if (sharedError) throw sharedError;

      // Combine owned and shared agencies
      const shared = sharedAccess?.map((s) => s.agencies).filter(Boolean) || [];
      const combined = [...(ownedAgencies || []), ...shared];

      // Remove duplicates
      const uniqueMap = new Map();
      combined.forEach((agency) => {
        if (agency && agency.id) {
          uniqueMap.set(agency.id, agency);
        }
      });

      return Array.from(uniqueMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },
    enabled: !!tenantId,
  });

  // Owned agencies only (to determine finance visibility)
  const { data: ownedAgencies } = useQuery({
    queryKey: ["owned-agencies", tenantId],
    queryFn: async () => {
      if (!tenantId) return [] as any[];
      const { data, error } = await supabase
        .from("agencies")
        .select("id")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  const ownedAgencyIds = (ownedAgencies || []).map((a: any) => a.id);

  // Fetch tenant-specific financial data for clients
  const { data: clientFinancialData } = useQuery({
    queryKey: ["client-tenant-financial-data", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("client_tenant_financial_data")
        .select("*")
        .eq("tenant_id", tenantId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const getClientFinancialData = (clientId: string) => {
    return (
      clientFinancialData?.find((f: any) => f.client_id === clientId) || null
    );
  };

  // For super admins: fetch all tenant IDs they own so we can show cross-tenant clients
  const { data: superAdminTenantIds } = useQuery({
    queryKey: ["super-admin-tenant-ids", isSuperAdmin],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) return [];
      const { data, error } = await supabase
        .from("user_roles")
        .select("tenant_id")
        .eq("user_id", session.user.id)
        .eq("role", "owner")
        .not("tenant_id", "is", null);
      if (error) throw error;
      return data?.map((r) => r.tenant_id).filter(Boolean) || [];
    },
    enabled: isSuperAdmin,
    staleTime: 1000 * 60 * 10,
  });

  const {
    data: clients,
    isLoading,
    isPending,
    isFetching,
  } = useQuery({
    queryKey: [
      "clients",
      tenantId,
      campaignerId,
      isCampaigner,
      isTeamManager,
      isOwner,
      isSuperAdmin,
      selectedAgency,
      agencies?.length || 0,
    ],
    queryFn: async () => {
      if (!tenantId) return [] as any[];
      const selectStr = CLIENT_LIST_SELECT;

      let query = supabase
        .from("clients")
        .select(selectStr)
        .order("created_at", { ascending: false });

      // 🔒 Always scope to current tenant — cross-tenant only via shared agencies
      if (selectedAgency && selectedAgency !== "all") {
        query = query.or(
          `tenant_id.eq.${tenantId},agency_id.eq.${selectedAgency}`,
        );
      } else if (agencies && agencies.length > 0) {
        const ids = agencies.map((a: any) => a.id);
        query = query.or(
          `tenant_id.eq.${tenantId},agency_id.in.(${ids.join(",")})`,
        );
      } else {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    // Don't gate on !!agencies — start fetching immediately with tenantId,
    // using agencies when available (cross-tenant clients). When agencies finish
    // loading the queryKey changes (agencies?.length) and we re-fetch automatically.
    enabled: (!isRestrictedClientViewer || !!campaignerId) && !!tenantId,
    staleTime: 60_000, // heavy list (all clients + joins) — avoid refetching on every remount/refocus
  });

  // 🔒 SECURITY GUARD: Filter clients by current tenant and accessible agencies
  const secureFilteredClients = useMemo(() => {
    if (!clients || !tenantId) return [];

    // 🔒 Strict tenant isolation: current tenant OR shared agency only
    return clients.filter((client) => {
      const isTenantMatch = client.tenant_id === tenantId;
      if (isTenantMatch) return true;
      // Allow cross-tenant only if agency is explicitly shared with this tenant
      const agencyIds = (agencies || []).map((a: any) => a.id);
      if (client.agency_id && agencyIds.includes(client.agency_id)) return true;
      return false;
    });
  }, [clients, tenantId, userAgencyIds, isOwner, isSuperAdmin]);

  // Never show "no clients" while the list is still on its way.
  const clientsResolving =
    !clients && isQueryResolving(isPending, isLoading, isFetching);

  const { data: campaigners } = useAssignableCampaigners({ activeOnly: true });

  // Fetch client-team mapping for campaigner filter (for managers/owners)
  const { data: clientTeam } = useQuery({
    queryKey: ["client-team", tenantId],
    queryFn: async () => {
      if (!tenantId) return [] as any[];
      const { data, error } = await supabase
        .from("client_team")
        .select("client_id, campaigner_id");
      if (error) throw error;
      return data;
    },
    enabled: !!tenantId,
  });

  // Get client IDs for the campaigner
  const { data: campaignerClientIds } = useQuery({
    queryKey: ["campaigner-client-ids", campaignerId],
    queryFn: async () => {
      if (!campaignerId) return null;
      const { data } = await supabase
        .from("client_team")
        .select("client_id")
        .eq("campaigner_id", campaignerId);
      return data?.map((ct) => ct.client_id) || [];
    },
    enabled: !!campaignerId && isRestrictedClientViewer,
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הלקוח נמחק בהצלחה");
      queryClient.invalidateQueries({ queryKey: ["clients", tenantId] });
      setDeletingClient(null);
    },
    onError: () => {
      toast.error("שגיאה במחיקת הלקוח");
    },
  });

  // Filter logic:
  // 1. Role-based access control
  // 2. Then apply global agency filter (selectedAgency)

  let accessibleClients = clients;

  if (!isOwner && !isSuperAdmin) {
    if (isRestrictedClientViewer) {
      // Pure campaigners see only their assigned clients
      const ids = Array.isArray(campaignerClientIds) ? campaignerClientIds : [];
      accessibleClients = clients?.filter((client) => ids.includes(client.id));
    } else if (isSeoOnlyViewer) {
      accessibleClients = clients?.filter((client: any) =>
        isSeoTaggedClient(client),
      );
    } else if (isTeamManager && userAgencyIds && userAgencyIds.length > 0) {
      // Team managers see all clients in their agencies
      accessibleClients = clients?.filter((client) =>
        userAgencyIds.includes(client.agency_id),
      );
    }
  }
  // Owner sees all clients (no filtering needed)

  // Global agency filter applies to ALL roles (including campaigners and team managers)
  if (selectedAgency && selectedAgency !== "all") {
    accessibleClients = accessibleClients?.filter(
      (client) => client.agency_id === selectedAgency,
    );
  }

  const filteredClients = accessibleClients;

  const visibleClients = filteredClients
    ? applyClientFilters(filteredClients, filters)
    : filteredClients;
  const canFilterByCampaigner = isTeamManager || isOwner;
  // Pure campaigners may not add campaigners to a client.
  const canAssignCampaigners = !(isCampaigner && !isTeamManager && !isOwner);

  const handleExportToExcel = () => {
    if (!visibleClients || visibleClients.length === 0) {
      toast.error("אין לקוחות לייצוא");
      return;
    }
    import("xlsx").then((XLSX) => {
      const exportData = visibleClients.map((client: any) => ({
        "שם הלקוח": client.name,
        סוכנות:
          agencies?.find((a: any) => a.id === client.agency_id)?.name || "",
        סטטוס: getStatusText(client.status),
        ריטיינר: client.retainer || "",
        "תקציב חודשי": client.monthly_budget || "",
        טלפון: client.phone || "",
        אימייל: client.email || "",
        אתר: client.website || "",
        "איש קשר": client.contact_name || "",
        הערות: client.notes || "",
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "לקוחות");
      XLSX.writeFile(wb, "לקוחות.xlsx");
      toast.success(`יוצאו ${exportData.length} לקוחות`);
    });
  };

  /** The export's status column: the status label, or the raw value when unknown. */
  function getStatusText(status: string) {
    return isClientStatus(status) ? CLIENT_STATUS_META[status].label : status;
  }

  const showKpis = !clientsResolving && (filteredClients?.length ?? 0) > 0;
  const rowActions = {
    mutations: rowMutations,
    canAssignCampaigners,
    onOpen: openClientInChat,
    onDuplicate: setDuplicatingClient,
    onDelete: setDeletingClient,
  };

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col gap-4 overflow-hidden p-4">
      <ClientsPageHeader
        shownCount={clientsResolving ? undefined : visibleClients?.length}
      >
        <ClientsImportExportMenu
          onExport={handleExportToExcel}
          onImportCsv={() => setShowImportCSV(true)}
          onImportSheet={() => setShowImportSheet(true)}
          onBulkMetaSync={
            isOwner || isSuperAdmin || isTeamManager
              ? () => {
                  setBulkMetaSyncResults([]);
                  setShowBulkMetaSync(true);
                }
              : null
          }
        />
        <AddClientForm />
      </ClientsPageHeader>

      {showKpis && (
        <ClientsKpiStrip
          clients={filteredClients ?? []}
          className={cn(viewMode === "chat" && "hidden md:grid")}
        />
      )}

      <ClientsToolbar
        filters={filters}
        onFilterChange={setFilter}
        campaigners={canFilterByCampaigner ? (campaigners ?? []) : null}
        showSearch={viewMode !== "chat"}
        activeFilterCount={activeFilterCount}
        onOpenFilters={() => setShowFiltersDialog(true)}
      >
        <ClientsViewToggle value={viewMode} onChange={setViewMode} />
      </ClientsToolbar>

      {/* Import dialogs opened from the import / export menu */}
      {showImportCSV && (
        <ImportClientsCSV
          externalOpen={showImportCSV}
          onExternalOpenChange={setShowImportCSV}
        />
      )}
      {showImportSheet && (
        <ImportClientsSheet
          externalOpen={showImportSheet}
          onExternalOpenChange={setShowImportSheet}
        />
      )}

      <ClientsFiltersDialog
        open={showFiltersDialog}
        onOpenChange={setShowFiltersDialog}
        filters={filters}
        onFilterChange={setFilter}
        campaigners={canFilterByCampaigner ? (campaigners ?? []) : null}
        activeFilterCount={activeFilterCount}
        onClearAll={() => setFilters(CLEARED_CLIENT_FILTERS)}
      />

      <div
        className={
          viewMode === "chat"
            ? "flex-1 min-h-0 overflow-hidden"
            : "flex-1 min-h-0 overflow-y-auto"
        }
      >
        {clientsResolving ? (
          <CarmenLoadingScreen
            variant="card"
            messages={["כרמן אוספת את רשימת הלקוחות…", "מסדרת לפי סוכנות…"]}
          />
        ) : viewMode === "chat" ? (
          <ClientsChatView
            key={pendingChatClientId ?? deepLinkClientId ?? "chat"}
            clients={visibleClients || []}
            agencies={agencies}
            canViewFinance={canViewFinance()}
            financeAccessReady={financeAccessReady}
            getClientFinancialData={getClientFinancialData}
            initialClientId={pendingChatClientId ?? deepLinkClientId}
            initialTab={deepLinkTab}
          />
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleClients?.map((client) => (
              <ClientGridCard key={client.id} client={client} {...rowActions} />
            ))}
          </div>
        ) : (
          <ClientsTable
            clients={visibleClients ?? []}
            selectedIds={selectedClientIds}
            onSelectedIdsChange={setSelectedClientIds}
            getFieldLabel={getFieldLabel}
            tenantId={tenantId}
            finance={{
              ready: financeAccessReady,
              canView: canViewFinance(),
              tenantFiguresOf: getClientFinancialData,
              ownedAgencyIds,
            }}
            {...rowActions}
          />
        )}
      </div>

      {!clientsResolving && visibleClients?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card py-16 text-center shadow-elevation-1">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-inset">
            <Users className="h-8 w-8 text-muted-foreground" />
          </span>
          <p className="mb-1 text-lg font-bold">לא נמצאו לקוחות</p>
          <p className="text-sm text-muted-foreground">התחל בהוספת לקוח חדש</p>
        </div>
      )}

      <DuplicateClientDialog
        open={!!duplicatingClient}
        onOpenChange={(open) => !open && setDuplicatingClient(null)}
        client={duplicatingClient}
      />

      {/* Bulk Meta Page Sync Dialog */}
      <Dialog
        open={showBulkMetaSync}
        onOpenChange={(open) => {
          if (!bulkMetaSyncRunning) setShowBulkMetaSync(open);
        }}
      >
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              שיוך עמודי Meta לכל הלקוחות
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              הפעולה תעבור על כל הלקוחות שיש להם Meta Ads Account ID ותשייך
              אוטומטית את עמוד הפייסבוק/אינסטגרם המתאים.
            </p>
            {bulkMetaSyncResults.length === 0 && !bulkMetaSyncRunning && (
              <div className="text-sm text-muted-foreground">
                לקוחות עם Meta Ads Account ID:{" "}
                <strong>
                  {
                    (clients || []).filter((c: any) =>
                      c.meta_ads_account_id?.trim(),
                    ).length
                  }
                </strong>
              </div>
            )}
            {(bulkMetaSyncRunning || bulkMetaSyncResults.length > 0) && (
              <div className="max-h-72 overflow-y-auto space-y-1 rounded-md border p-2">
                {bulkMetaSyncResults.map((r) => (
                  <div
                    key={r.clientId}
                    className="flex items-start gap-2 text-sm py-1"
                  >
                    {r.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-status-active mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    )}
                    <div>
                      <span className="font-medium">{r.clientName}</span>
                      <span className="text-muted-foreground mr-2 text-xs">
                        {r.message}
                      </span>
                    </div>
                  </div>
                ))}
                {bulkMetaSyncRunning && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    מעבד...
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowBulkMetaSync(false)}
                disabled={bulkMetaSyncRunning}
              >
                סגור
              </Button>
              <Button
                onClick={runBulkMetaSync}
                disabled={bulkMetaSyncRunning}
                className="gap-2"
              >
                {bulkMetaSyncRunning ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin" /> מעבד...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> הפעל שיוך
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingClient}
        onOpenChange={(open) => !open && setDeletingClient(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>אישור מחיקת לקוח</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את הלקוח{" "}
              <strong>{deletingClient?.name}</strong>? פעולה זו תמחק גם את כל
              המשימות והנתונים הקשורים ללקוח זה ולא ניתן לבטל אותה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingClient && deleteClientMutation.mutate(deletingClient.id)
              }
              className="bg-destructive hover:bg-destructive/90"
            >
              מחק לקוח
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
