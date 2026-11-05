/** The scene pictures' approval as the workshop tool tests start from it (stills-approval.ts). */

import type { WorkshopDeps } from "../gate.ts";
import { STILLS_QUESTION } from "./stills-approval.ts";

/**
 * A production call with the pictures approved: the user tapped approval this turn on a question
 * that showed every scene picture in an earlier turn. A test that sets lastAssistant itself, or
 * calls another tool, runs as given.
 */
export function withStillsApproved(
  db: unknown,
  name: string,
  args: Record<string, unknown>,
  deps: WorkshopDeps | undefined,
): { args: Record<string, unknown>; deps: WorkshopDeps } {
  if (name !== "workshop_produce_video" || deps?.lastAssistant) {
    return { args, deps: deps ?? {} };
  }
  stillsAskedEarlier(db);
  return {
    args: { stills_approved: true, ...args },
    deps: {
      lastAssistant: STILLS_QUESTION,
      userText: "תפיקי",
      turnId: "turn-approved",
      ...deps,
    },
  };
}

/** A fakeDb project whose scene pictures the pictures question showed in an earlier turn. */
function stillsAskedEarlier(db: unknown) {
  const script = (db as { script?: Record<string, unknown> }).script;
  const item = script?.["marketing_work_items:select"] as
    { payload?: Record<string, unknown> } | undefined;
  if (!script || !item?.payload) {
    return;
  }
  const scenes = script["marketing_video_scenes:select"];
  const stills = (Array.isArray(scenes) ? scenes : [])
    .map((scene) => (scene as { still_asset_id?: unknown }).still_asset_id)
    .filter((id) => typeof id === "string");
  const video = (item.payload.video ?? {}) as Record<string, unknown>;
  script["marketing_work_items:select"] = {
    ...item,
    payload: {
      ...item.payload,
      video: {
        asked_stills: stills,
        asked_stills_turn: "turn-asked",
        ...video,
      },
    },
  };
}
