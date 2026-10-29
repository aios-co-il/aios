import { loadProject, voiceHelpers } from "../project-io.ts";
import { type ToolContext } from "../tool-context.ts";
import { chooseVoice } from "../voice-tool.ts";

export async function workshopChooseVoice(ctx: ToolContext) {
  const { supabase, tenantId, args, assertClientAccess, deps } = ctx;
  const itemId = String(args.item_id ?? "").trim();
  if (!itemId) return { error: "item_id נדרש" };
  const loaded = await loadProject(
    supabase,
    tenantId,
    itemId,
    assertClientAccess,
  );
  if ("error" in loaded) return loaded;
  const { payload } = loaded.project;
  return await chooseVoice(
    args,
    voiceHelpers(supabase, tenantId, itemId, payload, deps),
  );
}
