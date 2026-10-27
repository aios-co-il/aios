import { executeCreativeStudioTool } from "../../creative-studio-tools.ts";
import { assetForCarmen } from "../assets.ts";
import { briefAnswersOf } from "../brief-answers.ts";
import { lookOf } from "../look.ts";
import { type RunRow, productionReport } from "../production.ts";
import { loadAssets } from "../project-io.ts";
import { asRecord } from "../record.ts";
import { type ToolContext } from "../tool-context.ts";

export async function workshopGetState(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  const studio = (await executeCreativeStudioTool(
    supabase,
    tenantId,
    "get_studio_state",
    { item_id: itemId },
    assertClientAccess,
  )) as Record<string, unknown>;
  if (studio.error) return studio;
  const [artifacts, running, item, assets] = await Promise.all([
    supabase
      .from("workshop_artifacts")
      .select("id, kind, title, folder, status, meta")
      .eq("item_id", itemId)
      .eq("tenant_id", tenantId)
      .order("created_at"),
    supabase
      .from("marketing_runs")
      .select(
        "kind, status, error, created_at, provider, fallback_from:output->>fallback_from, sound_effects_error:output->>sound_effects_error",
      )
      .eq("item_id", itemId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("marketing_work_items")
      .select("payload, client_id")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    loadAssets(supabase, tenantId, itemId),
  ]);
  const clientRow = item.data?.client_id
    ? (
        await supabase
          .from("clients")
          .select("id, name, website")
          .eq("id", item.data.client_id)
          .eq("tenant_id", tenantId)
          .maybeSingle()
      ).data
    : null;
  const runs = (Array.isArray(running.data) ? running.data : []) as RunRow[];
  const itemPayload = asRecord(item.data?.payload);
  return {
    ...studio,
    artifacts: (Array.isArray(artifacts.data) ? artifacts.data : []).map(
      (page: Record<string, any>) => {
        const { meta, ...rest } = page;
        const reason = asRecord(meta).text;
        return page.status === "failed" && typeof reason === "string"
          ? { ...rest, error: reason }
          : rest;
      },
    ),
    running: runs.filter(
      (run) => run.status === "queued" || run.status === "running",
    ),
    production: productionReport(
      runs,
      asRecord(asRecord(itemPayload.video).production),
    ),
    plan: asRecord(itemPayload.workshop),
    brief: String(itemPayload.brief_text ?? "").slice(0, 3000),
    brief_answers: briefAnswersOf(itemPayload),
    film_brief: lookOf(itemPayload).film,
    look: {
      references: lookOf(itemPayload).references.length,
      style_written: lookOf(itemPayload).bible.length > 0,
      engine: lookOf(itemPayload).engine,
    },
    client: clientRow
      ? { id: clientRow.id, name: clientRow.name, website: clientRow.website }
      : null,
    assets: assets.slice(0, 30).map(assetForCarmen),
  };
}
