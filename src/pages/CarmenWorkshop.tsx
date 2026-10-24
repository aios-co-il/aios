import { useEffect, useState } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { ClientSelector } from "@/components/marketing/ClientSelector";
import { toast } from "sonner";

type ProjectRow = {
  id: string;
  title: string | null;
  client_id: string | null;
  payload: Record<string, unknown> | null;
};

export default function CarmenWorkshop() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id;
  const { setOpen } = useCommandCenterSidecar();
  const access = useCommandCenterAccess();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [blank, setBlank] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (access.allowed) setOpen(true);
  }, [access.allowed, setOpen]);

  useEffect(
    () =>
      subscribeWorkshopEvents((event) => {
        void queryClient.invalidateQueries({
          queryKey: ["carmen-workshop-projects", tenantId],
        });
        if (event.event === "project") {
          setBlank(false);
          setProjectId(event.item_id);
        }
      }),
    [queryClient, tenantId],
  );

  const projects = useQuery({
    queryKey: ["carmen-workshop-projects", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ProjectRow[]> => {
      const { data, error } = await supabase
        .from("marketing_work_items")
        .select("id,title,status,updated_at,client_id,payload")
        .eq("tenant_id", tenantId!)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? []) as unknown as ProjectRow[];
    },
  });

  const selected = blank
    ? null
    : (projects.data?.find((item) => item.id === projectId) ??
      projects.data?.[0] ??
      null);

  const assignClient = async (clientId: string | null) => {
    if (!selected) return;
    const { error } = await supabase.rpc(
      "workshop_assign_client" as never,
      {
        p_item_id: selected.id,
        p_client_id: clientId,
      } as never,
    );
    if (error) {
      toast.error("לא הצלחנו לשייך את הפרויקט ללקוח");
      return;
    }
    toast.success(clientId ? "הפרויקט שויך ללקוח" : "השיוך ללקוח הוסר");
    await queryClient.invalidateQueries({
      queryKey: ["carmen-workshop-projects", tenantId],
    });
  };

  const artifacts = useWorkshopArtifacts(tenantId, selected?.id ?? null);

  useEffect(() => {
    setArtifactId(null);
  }, [selected?.id]);

  useEffect(() => {
    setWorkshopContext({
      projectId: selected?.id ?? null,
      title: selected?.title ?? null,
      selectedArtifactId: artifactId,
    });
  }, [selected?.id, selected?.title, artifactId]);

  useEffect(() => () => setWorkshopContext(null), []);

  return (
    <div
      data-workshop
      className="flex min-h-[28rem] flex-1 flex-col overflow-hidden"
      dir="rtl"
    >
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2 md:px-4 md:py-3">
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
            {selected && !blank
              ? selected.title?.trim() || "ללא שם"
              : "פרויקט חדש"}
          </p>
        </div>
        {selected && !blank ? (
          <div className="ms-auto shrink-0">
            <ClientSelector
              tenantId={tenantId}
              value={selected.client_id}
              onChange={(id) => void assignClient(id)}
              allowGeneral
              generalLabel="ללא לקוח"
            />
          </div>
        ) : null}
      </header>
      {!access.loading && !access.allowed ? (
        <p className="shrink-0 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
          כרמן לא פתוחה לחשבון הזה. אפשר לבקש גישה בהגדרות של כרמן, תחת הרשאות.
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {projectsOpen ? (
          <WorkshopProjects
            projects={projects.data ?? []}
            selectedId={selected?.id ?? null}
            loading={projects.isLoading}
            error={projects.isError}
            onCreate={() => {
              setBlank(true);
              setProjectId(null);
            }}
            onSelect={(id) => {
              setBlank(false);
              setProjectId(id);
            }}
          />
        ) : null}
        <main className="min-h-0 min-w-0 flex-1">
          <WorkshopFeed
            artifacts={artifacts.data ?? []}
            loading={artifacts.isLoading || (projects.isLoading && !blank)}
            hasProject={!!selected}
            selectedId={artifactId}
            onSelect={setArtifactId}
          />
        </main>
      </div>
    </div>
  );
}
