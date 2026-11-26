import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { requireTenantId } from "@/lib/requireTenantId";
import {
  ASSET_BUCKET,
  syncClientAssets,
} from "../../../supabase/functions/_shared/workshop/assets.ts";

/** The project types a user picks when opening a project by hand (workshop_create_project). */
export const PROJECT_KINDS = [
  { value: "video", label: "סרטון" },
  { value: "static", label: "מודעה" },
  { value: "campaign", label: "קמפיין" },
  { value: "landing", label: "עמוד נחיתה" },
] as const;

export type ProjectKind = (typeof PROJECT_KINDS)[number]["value"];

/** What the projects list can do to its projects; each call resolves once it is saved. */
export interface ProjectActions {
  create: (title: string, kind: ProjectKind) => Promise<void>;
  rename: (itemId: string, title: string) => Promise<void>;
  archive: (itemId: string) => Promise<void>;
  /** Opens a blank board with Carmen's chat, for a project described in words instead. */
  askCarmen: () => void;
}

/**
 * Creates, renames and archives workshop projects through their RPCs, refreshes the list, and
 * tells the user how it went. A project created while one client is in view belongs to that
 * client and gets its material in the assets tab, as an assigned project does.
 */
export function useWorkshopProjectActions({
  tenantId,
  clientId,
  onCreated,
  onArchived,
  askCarmen,
}: {
  tenantId: string | undefined;
  clientId: string | null;
  onCreated: (itemId: string) => void;
  onArchived: (itemId: string) => void;
  askCarmen: () => void;
}): ProjectActions {
  const queryClient = useQueryClient();

  /** Reloads every filter of the projects list. */
  function refresh() {
    return queryClient.invalidateQueries({
      queryKey: ["carmen-workshop-projects", tenantId],
    });
  }

  /** Shows the RPC's own message, which is written for the user, or a fallback. */
  function showError(error: Error, fallback: string) {
    toast.error(error.message || fallback);
  }

  const createProject = useMutation({
    mutationFn: ({ title, kind }: { title: string; kind: ProjectKind }) =>
      createWorkshopProject(requireTenantId(tenantId), clientId, title, kind),
    onError: (error: Error) => showError(error, "פתיחת הפרויקט נכשלה"),
    onSuccess: async ({ itemId, assetsFailed }) => {
      await refresh();
      toast.success("הפרויקט נפתח");
      if (assetsFailed) {
        toast.error("הפרויקט נפתח, אך הנכסים של הלקוח לא נטענו");
      }
      onCreated(itemId);
    },
  });

  const renameProject = useMutation({
    mutationFn: ({ itemId, title }: { itemId: string; title: string }) =>
      renameWorkshopProject(itemId, title),
    onError: (error: Error) => showError(error, "שינוי השם נכשל"),
    onSuccess: async () => {
      await refresh();
      toast.success("השם עודכן");
    },
  });

  const archiveProject = useMutation({
    mutationFn: archiveWorkshopProject,
    onError: (error: Error) => showError(error, "המחיקה נכשלה"),
    onSuccess: async (itemId) => {
      await refresh();
      toast.success("הפרויקט נמחק מהרשימה");
      onArchived(itemId);
    },
  });

  // The dialogs await each save so they stay open, pending, until it lands or is refused.
  return {
    create: async (title, kind) => {
      await createProject.mutateAsync({ title, kind });
    },
    rename: async (itemId, title) => {
      await renameProject.mutateAsync({ itemId, title });
    },
    archive: async (itemId) => {
      await archiveProject.mutateAsync(itemId);
    },
    askCarmen,
  };
}

/** Opens the project, then loads the client's material into its assets tab when it has one. */
async function createWorkshopProject(
  tenantId: string,
  clientId: string | null,
  title: string,
  kind: ProjectKind,
) {
  const { data: itemId, error } = await supabase.rpc(
    "workshop_create_project",
    {
      p_tenant_id: tenantId,
      p_title: title,
      p_kind: kind,
      p_client_id: clientId ?? undefined,
    },
  );
  if (error) {
    throw new Error(error.message);
  }
  if (!clientId) {
    return { itemId, assetsFailed: false };
  }
  const synced = await syncClientAssets(
    supabase,
    { tenantId, itemId, clientId },
    (path) =>
      supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl,
  );
  return { itemId, assetsFailed: Boolean(synced.error) };
}

/** Renames the project; the RPC's refusal becomes the thrown message. */
async function renameWorkshopProject(itemId: string, title: string) {
  const { error } = await supabase.rpc("workshop_rename_project", {
    p_item_id: itemId,
    p_title: title,
  });
  if (error) {
    throw new Error(error.message);
  }
}

/** Archives the project; the RPC's refusal becomes the thrown message. */
async function archiveWorkshopProject(itemId: string) {
  const { error } = await supabase.rpc("workshop_archive_project", {
    p_item_id: itemId,
  });
  if (error) {
    throw new Error(error.message);
  }
  return itemId;
}
