/** The project brief a reference analysis proposes its storyboard for (referenceAnalysis.ts). */
import type { SupabaseRest } from "../supabaseRest.ts";
import { rowsOf } from "./rows.ts";
import type { VideoRun, WorkItemPayload } from "./types.ts";

/** Reads the project brief the proposal should be written for. */
export async function loadBrief(
  db: Pick<SupabaseRest, "select">,
  run: Pick<VideoRun, "item_id" | "tenant_id" | "input">,
) {
  // Scoped to the run's tenant: run rows are written by tenant members.
  const [item] = rowsOf<{
    title?: string | null;
    client_id?: string | null;
    payload?: WorkItemPayload | null;
  }>(
    await db.select(
      "marketing_work_items",
      `id=eq.${encodeURIComponent(String(run.item_id))}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&select=title,client_id,payload`,
    ),
  );
  if (!item) {
    throw new Error("run item is not in the run's tenant (is required)");
  }
  const payload: WorkItemPayload = item?.payload ?? {};
  let client: ClientRow | undefined;
  if (item?.client_id) {
    [client] = rowsOf<ClientRow>(
      await db.select(
        "clients",
        `id=eq.${encodeURIComponent(item.client_id)}&tenant_id=eq.${encodeURIComponent(run.tenant_id)}&select=name,industry,website`,
      ),
    );
  }
  return [
    client &&
      `Client: ${client.name}${client.industry ? ` (${client.industry})` : ""}${client.website ? ` · ${client.website}` : ""}`,
    item?.title && `Project: ${item.title}`,
    payload.brief_text && `Brief: ${payload.brief_text}`,
    payload.copy_text && `Copy: ${String(payload.copy_text).slice(0, 2000)}`,
    run.input?.goal && `Goal: ${run.input.goal}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The clients columns the brief names. */
interface ClientRow {
  name?: string | null;
  industry?: string | null;
  website?: string | null;
}
