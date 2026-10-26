import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTenant } from "@/hooks/useCurrentTenant";
import { useCommandCenterSidecar } from "@/contexts/CommandCenterSidecarContext";
import { useCommandCenterAccess } from "@/components/carmen-command/access";
import { Button } from "@/components/ui/button";
import { WorkshopFeed } from "@/components/workshop/WorkshopFeed";
import { useWorkshopArtifacts } from "@/components/workshop/useWorkshopArtifacts";
import {
  setWorkshopContext,
  subscribeWorkshopEvents,
} from "@/lib/workshopBridge";
import { WorkshopProjects } from "@/components/workshop/WorkshopProjects";
import { WorkshopClientCard } from "@/components/workshop/WorkshopClientCard";
import { WorkshopDepartmentCard } from "@/components/workshop/WorkshopDepartmentCard";
import {
  defaultProject,
  groupProjects,
  type WorkshopListRow,
} from "@/components/workshop/workshopProjectList";
import { ClientSelector } from "@/components/marketing/ClientSelector";
import {
  ALL_CLIENTS_FILTER,
  clientFilterToParam,
  parseClientFilter,
  type MarketingClientFilter,
} from "@/components/marketing/clientFilter";
import { toast } from "sonner";
import {
  ASSET_BUCKET,
  syncClientAssets,
} from "../../supabase/functions/_shared/workshop/assets.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function CarmenWorkshop() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id;
  const { setOpen } = useCommandCenterSidecar();
  const access = useCommandCenterAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  // ?client= all | general | <uuid> (the marketing convention); ?project=<uuid>.
  const clientFilter = parseClientFilter(searchParams.get("client"));
  const clientParam = clientFilterToParam(clientFilter) ?? "all";
  const viewClientId =
    clientFilter &&
    clientFilter !== ALL_CLIENTS_FILTER &&
    UUID.test(clientFilter)
      ? clientFilter
      : null;
  const byClient = clientFilter === ALL_CLIENTS_FILTER;
  const projectParam = searchParams.get("project");
  const projectId =
    projectParam && UUID.test(projectParam) ? projectParam : null;
  const [blank, setBlank] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(() => !!viewClientId);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const updateParams = useCallback(
    (
      change: (params: URLSearchParams) => void,
      options: { replace?: boolean } = {},
    ) =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          change(next);
          return next;
        },
        { replace: options.replace },
      ),
    [setSearchParams],
  );

  const openProjectId = useRef(projectId);
  openProjectId.current = projectId;
  const openProject = useCallback(
    (id: string) => {
      setBlank(false);
      // Carmen reports the open project again on later turns; that adds no history entry.
      if (openProjectId.current === id) return;
      updateParams((params) => params.set("project", id));
    },
    [updateParams],
  );

  const selectClient = (filter: MarketingClientFilter) => {
    setBlank(false);
    updateParams(
      (params) => {
        params.set("client", clientFilterToParam(filter) ?? "all");
        params.delete("project");
      },
      { replace: true },
    );
  };

  // A project in the URL (a deep link, or back to it) is never the blank board.
  useEffect(() => {
    if (projectId) setBlank(false);
  }, [projectId]);

  useEffect(() => {
    if (access.allowed) setOpen(true);
  }, [access.allowed, setOpen]);

  useEffect(
    () =>
      subscribeWorkshopEvents((event) => {
        void queryClient.invalidateQueries({
          queryKey: ["carmen-workshop-projects", tenantId],
        });
        if (event.event === "project") openProject(event.item_id);
      }),
    [queryClient, tenantId, openProject],
  );

  const projects = useQuery({
    queryKey: ["carmen-workshop-projects", tenantId, clientParam],
    queryFn: tenantId
      ? async (): Promise<WorkshopListRow[]> => {
          const { data, error } = await supabase.rpc(
            "workshop_list_projects" as never,
            { p_tenant_id: tenantId, p_client: clientParam } as never,
          );
          if (error) throw error;
          return (data ?? []) as unknown as WorkshopListRow[];
        }
      : skipToken,
  });
  const rows = useMemo(() => projects.data ?? [], [projects.data]);
  const groups = useMemo(() => groupProjects(rows, byClient), [rows, byClient]);

  // One client in view and no project picked: the client card. Otherwise the latest board.
  const selected = blank
    ? null
    : projectId
      ? (rows.find((item) => item.id === projectId) ?? null)
      : viewClientId
        ? null
        : defaultProject(rows);
  const board = selected?.has_board ? selected : null;

  const assign = useMutation({
    mutationFn: async ({
      itemId,
      clientId,
    }: {
      itemId: string;
      clientId: string | null;
    }) => {
      const { error } = await supabase.rpc(
        "workshop_assign_client" as never,
        { p_item_id: itemId, p_client_id: clientId } as never,
      );
      if (error) throw error;
      const synced = await syncClientAssets(
        supabase,
        { tenantId: tenantId ?? "", itemId, clientId },
        (path) =>
          supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl,
      );
      return { itemId, clientId, synced };
    },
    onError: () => toast.error("לא הצלחנו לשייך את הפרויקט ללקוח"),
    onSuccess: ({ itemId, clientId, synced }) => {
      if (synced.error)
        toast.error("הפרויקט שויך, אך הנכסים של הלקוח לא נטענו");
      else if (clientId)
        toast.success(
          synced.added > 0
            ? `הפרויקט שויך ללקוח, ו-${synced.added} נכסים שלו נוספו ללשונית הנכסים`
            : "הפרויקט שויך ללקוח",
        );
      else toast.success("השיוך ללקוח הוסר");
      // The project now belongs elsewhere: follow it rather than lose the open board.
      if (!byClient && clientId !== viewClientId)
        updateParams(
          (params) => {
            params.set("client", clientFilterToParam(clientId) ?? "all");
            params.set("project", itemId);
          },
          { replace: true },
        );
      void queryClient.invalidateQueries({
        queryKey: ["workshop-assets", tenantId, itemId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["carmen-workshop-projects", tenantId],
      });
    },
  });
  const assignClient = (clientId: string | null) => {
    if (board && tenantId) assign.mutate({ itemId: board.id, clientId });
  };

  const viewClient = useQuery({
    queryKey: ["carmen-workshop-client", viewClientId],
    queryFn: viewClientId
      ? async () => {
          const { data } = await supabase
            .from("clients")
            .select("name")
            .eq("id", viewClientId)
            .maybeSingle();
          return (data?.name as string | undefined) ?? null;
        }
      : skipToken,
  });
  const viewClientName = viewClientId ? (viewClient.data ?? null) : null;

  const artifacts = useWorkshopArtifacts(tenantId, board?.id ?? null);

  useEffect(() => {
    setArtifactId(null);
  }, [board?.id]);

  useEffect(() => {
    setWorkshopContext({
      projectId: board?.id ?? null,
      title: board?.title ?? null,
      selectedArtifactId: artifactId,
      clientId: viewClientId,
      clientName: viewClientName,
    });
  }, [board?.id, board?.title, artifactId, viewClientId, viewClientName]);

  useEffect(() => () => setWorkshopContext(null), []);

  const startNew = () => {
    setBlank(true);
    updateParams((params) => params.delete("project"));
    setProjectsOpen(false);
    setOpen(true);
    toast.info(
      viewClientName
        ? `פרויקט חדש ל${viewClientName}: כתבי לכרמן מה ליצור`
        : "פרויקט חדש: כתבי לכרמן מה ליצור",
    );
  };

  const showClientCard =
    !blank && !selected && !!viewClientId && !(projectId && projects.isLoading);

  return (
    <div
      data-workshop
      className="flex min-h-[28rem] flex-1 flex-col overflow-hidden"
      dir="rtl"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-3 py-2 md:px-4 md:py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5"
          aria-expanded={projectsOpen}
          onClick={() => setProjectsOpen((value) => !value)}
        >
          {projectsOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
          פרויקטים
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold md:text-lg">
            הסדנה של כרמן
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {selected
              ? selected.title?.trim() || "ללא שם"
              : showClientCard
                ? (viewClientName ?? "כרטיס לקוח")
                : "פרויקט חדש"}
          </p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {viewClientId && !showClientCard ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => {
                setBlank(false);
                updateParams((params) => params.delete("project"));
              }}
            >
              כרטיס לקוח
            </Button>
          ) : null}
          <ClientSelector
            tenantId={tenantId}
            value={clientFilter}
            onChange={selectClient}
            allowGeneral
            allowAllClients
            generalLabel="ללא לקוח"
          />
          {board ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">שיוך:</span>
              <ClientSelector
                tenantId={tenantId}
                value={board.client_id}
                onChange={assignClient}
                allowGeneral
                generalLabel="ללא לקוח"
              />
            </div>
          ) : null}
        </div>
      </header>
      {!access.loading && !access.allowed ? (
        <p className="shrink-0 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
          כרמן לא פתוחה לחשבון הזה. אפשר לבקש גישה בהגדרות של כרמן, תחת הרשאות.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {projectsOpen ? (
          <WorkshopProjects
            groups={groups}
            byClient={byClient}
            selectedId={selected?.id ?? null}
            loading={projects.isLoading}
            error={projects.isError}
            onCreate={startNew}
            onSelect={openProject}
          />
        ) : null}
        <main className="min-h-0 min-w-0 flex-1">
          {showClientCard && viewClientId ? (
            <WorkshopClientCard
              clientId={viewClientId}
              onNewCreative={startNew}
            />
          ) : selected && !selected.has_board ? (
            <WorkshopDepartmentCard item={selected} />
          ) : (
            <WorkshopFeed
              artifacts={artifacts.data ?? []}
              loading={artifacts.isLoading || (projects.isLoading && !blank)}
              hasProject={!!board}
              selectedId={artifactId}
              onSelect={setArtifactId}
              tenantId={tenantId}
              projectId={board?.id ?? null}
              clientName={board?.client_name ?? null}
            />
          )}
        </main>
      </div>
    </div>
  );
}
