/**
 * Carmen's workshop tools. Plain TypeScript, no Deno APIs.
 *
 * The user says what they want in one sentence; these tools decide type, format, style and
 * folder (see workshop/defaults.ts), do the work on the server and record every result as a
 * page on the workshop board (workshop_artifacts). Nothing here needs an open screen.
 *
 * Every call loads the project inside the caller's tenant and checks client access; the agent
 * runs with the service role, so RLS does not apply. One handler per tool lives in
 * workshop/tools/; this file only routes a call to its handler.
 */

import type { Db } from "./workshop/db.ts";
import { type WorkshopDeps } from "./workshop/gate.ts";
import { isWorkshopTool } from "./workshop/tool-definitions.ts";
import type { ToolContext } from "./workshop/tool-context.ts";
import { workshopAddAssets } from "./workshop/tools/add-assets.ts";
import { workshopAssignClient } from "./workshop/tools/assign-client.ts";
import { workshopCheckConnections } from "./workshop/tools/check-connections.ts";
import { workshopChooseVoice } from "./workshop/tools/choose-voice.ts";
import { workshopEditFromAssets } from "./workshop/tools/edit-from-assets.ts";
import { workshopGetState } from "./workshop/tools/get-state.ts";
import { workshopInspectSite } from "./workshop/tools/inspect-site.ts";
import { workshopMakeCreative } from "./workshop/tools/make-creative.ts";
import { workshopMakeStills } from "./workshop/tools/make-stills.ts";
import { workshopProduceVideo } from "./workshop/tools/produce-video.ts";
import { workshopSaveCopy } from "./workshop/tools/save-copy.ts";
import { workshopStartProject } from "./workshop/tools/start-project.ts";
import { workshopStoryboard } from "./workshop/tools/storyboard.ts";

export {
  WORKSHOP_SKIN,
  WORKSHOP_TOOLS,
  isWorkshopTool,
} from "./workshop/tool-definitions.ts";
export { recordArtifact } from "./workshop/record.ts";
export type { WorkshopDeps } from "./workshop/gate.ts";

const HANDLERS: Record<string, (ctx: ToolContext) => Promise<unknown>> = {
  workshop_start_project: workshopStartProject,
  workshop_check_connections: workshopCheckConnections,
  workshop_assign_client: workshopAssignClient,
  workshop_inspect_site: workshopInspectSite,
  workshop_add_assets: workshopAddAssets,
  workshop_get_state: workshopGetState,
  workshop_make_creative: workshopMakeCreative,
  workshop_save_concepts: workshopSaveCopy,
  workshop_save_copy: workshopSaveCopy,
  workshop_choose_voice: workshopChooseVoice,
  workshop_edit_from_assets: workshopEditFromAssets,
  workshop_storyboard: workshopStoryboard,
  workshop_make_stills: workshopMakeStills,
  workshop_produce_video: workshopProduceVideo,
};

export async function executeWorkshopTool(
  supabase: Db,
  tenantId: string,
  name: string,
  args: Record<string, unknown>,
  assertClientAccess: (clientId: string) => Promise<void> = async () => {},
  userId: string | null = null,
  deps: WorkshopDeps = {},
) {
  if (!isWorkshopTool(name)) return { error: "כלי לא מוכר" };
  const handler = HANDLERS[name];
  if (!handler) return { error: "כלי לא מוכר" };
  return await handler({
    supabase,
    tenantId,
    name,
    args,
    assertClientAccess,
    userId,
    deps,
  });
}
