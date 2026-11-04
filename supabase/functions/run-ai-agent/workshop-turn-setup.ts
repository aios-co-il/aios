/**
 * The workshop's part of a Carmen run (run-ai-agent): whether this turn is a workshop turn, its
 * note and specialist, and the tools the turn may offer.
 */

import { parseActiveSkin } from "../_shared/carmen/active-skin.ts";
import { isBlockedInWorkshop } from "../_shared/workshop/blocked-tools.ts";
import { type Db } from "../_shared/workshop/db.ts";
import {
  workshopArtifactIdFrom,
  workshopItemIdFrom,
  workshopProjectKind,
  workshopSceneIdFrom,
} from "../_shared/workshop/role-project.ts";
import { workshopRole } from "../_shared/workshop/roles.ts";
import { lastAssistantText } from "../_shared/workshop/tapped-answers.ts";
import {
  isWorkshopTool,
  WORKSHOP_SKIN,
} from "../_shared/workshop/tool-definitions.ts";
import { workshopTurnNote } from "../_shared/workshop/turn-note.ts";

/**
 * In the workshop the server picks the specialist for this message (designer, producer or
 * video editor) from the message and the open project, and pins her skin; see roles.ts.
 * Approves a waiting budget from the user's code and states the project's next step.
 */
export async function workshopTurnSetup(
  supabase: Db,
  bodyJson: Record<string, unknown>,
  tenantId: unknown,
  commandText: unknown,
  conversationHistory: unknown,
) {
  const workshopNote = await workshopTurnNote(
    supabase,
    tenantId,
    workshopItemIdFrom(bodyJson),
    String(commandText ?? ""),
    lastAssistantText(conversationHistory),
    workshopArtifactIdFrom(bodyJson),
  );
  const workshopRoleForRun = workshopRole(
    String(commandText ?? ""),
    parseActiveSkin(bodyJson.active_skin),
    await workshopProjectKind(
      supabase,
      tenantId,
      workshopItemIdFrom(bodyJson),
      workshopSceneIdFrom(bodyJson),
    ),
  );
  return { workshopNote, workshopRoleForRun };
}

/** A turn in the workshop skin, outside WhatsApp. */
export function isWorkshopTurn(surface: unknown, taskSkills: unknown): boolean {
  return (
    surface !== "whatsapp" &&
    Array.isArray(taskSkills) &&
    taskSkills.includes(WORKSHOP_SKIN)
  );
}

/**
 * Workshop tools write to the board of the open project; outside the workshop skin (WhatsApp,
 * other chats) Carmen has no board to show them on.
 */
export function workshopTurnTools<T extends { name: string }>(
  tools: Array<T>,
  inWorkshop: boolean,
): Array<T> {
  if (!inWorkshop) {
    return tools.filter((t) => !isWorkshopTool(t.name));
  }
  // A workshop "מאשר" answers the workshop: the approval queue (WhatsApp, Meta) is not
  // reachable from here, so a tap can never run an unrelated pending approval. Tools that
  // publish, message people, change ads or act later are not offered here either.
  return tools.filter((t) => !isBlockedInWorkshop(t.name, true));
}
