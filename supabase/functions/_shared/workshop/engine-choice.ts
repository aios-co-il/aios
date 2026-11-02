/**
 * The optional engine Carmen may pass to a workshop tool. An engine the tenant has not connected
 * (or one the tool does not know) is dropped before the tool runs, so the server picks a
 * connected one and the result carries a short note instead of an error she would retry on.
 */

import type { WorkshopDeps } from "./gate.ts";
import { higgsfieldCredential } from "./higgsfield-credential.ts";
import { normalizeEngine } from "./image-providers.ts";
import {
  isSceneEngine,
  type SceneEngine,
  type VideoConnections,
} from "./video-cost.ts";

const IMAGE_ENGINE_TOOLS = new Set([
  "workshop_storyboard",
  "workshop_make_stills",
  "workshop_make_creative",
]);
const SCENE_ENGINE_TOOLS = new Set(["workshop_produce_video"]);

const filled = (settings: Record<string, unknown>, key: string) =>
  typeof settings[key] === "string" && (settings[key] as string).trim() !== "";

/**
 * Scene engines the tenant can run; the free preview needs no key. Kling runs on the tenant's own
 * keys, or on keys the render worker of this environment holds, which the server cannot see:
 * RENDER_WORKER_KLING=1 in the edge function secrets says it has them. Without either, a film
 * sent to Kling failed in the worker (on Staging, 1 Nov: "KLING_ACCESS_KEY and KLING_SECRET_KEY
 * are required").
 */
export function connectedSceneEngines(
  settings: Record<string, unknown>,
  connections: VideoConnections = {},
  workerHasKling = false,
): SceneEngine[] {
  const kling =
    workerHasKling ||
    (filled(settings, "kling_access_key") &&
      filled(settings, "kling_secret_key"));
  return [
    "mock",
    ...(kling ? (["kling"] as const) : []),
    ...(connections.openrouter ? (["openrouter"] as const) : []),
    ...(filled(settings, "elevenlabs_api_key")
      ? (["elevenlabs"] as const)
      : []),
    ...(higgsfieldCredential(
      settings.higgsfield_api_key_id,
      settings.higgsfield_api_key_secret,
    ).includes(":")
      ? (["higgsfield"] as const)
      : []),
  ];
}

export const engineNote = (raw: string) =>
  `המנוע "${raw.slice(0, 40)}" לא מחובר, אז השרת בחר מנוע מחובר בעצמו.`;

/** The tool's args with an unusable engine dropped, and the note to return when it was. */
export async function settleEngine(
  name: string,
  args: Record<string, unknown>,
  deps: WorkshopDeps,
): Promise<{ args: Record<string, unknown>; note?: string }> {
  const raw = typeof args.engine === "string" ? args.engine.trim() : "";
  if (!raw) return { args };
  if (IMAGE_ENGINE_TOOLS.has(name)) {
    const id = normalizeEngine(raw);
    const connected = deps.imageEngines ? await deps.imageEngines() : null;
    if (id && (!connected || connected.includes(id)))
      return { args: { ...args, engine: id } };
  } else if (SCENE_ENGINE_TOOLS.has(name)) {
    const connected = deps.sceneEngines ? await deps.sceneEngines() : null;
    if (isSceneEngine(raw) && (!connected || connected.includes(raw)))
      return { args };
  } else return { args };
  const { engine: _dropped, ...rest } = args;
  return { args: rest, note: engineNote(raw) };
}
