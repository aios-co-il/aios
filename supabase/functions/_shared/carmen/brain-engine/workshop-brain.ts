/**
 * The workshop runs on the OpenRouter brain unless the user picked a brain: on Staging Carmen's
 * own engine (a small model) picked the wrong workshop tools. David decided this on 31 Oct, so
 * here a premium brain runs without being picked in the brain picker. Carmen's own engine stays
 * as the fallback when the user holds that grant.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { type BrainEngine, resolveBrainEngine } from "./load.ts";

export const WORKSHOP_BRAIN = "openrouter";

const WORKSHOP_SKIN = "carmen_workshop";

type EngineBody = Parameters<typeof resolveBrainEngine>[2] & {
  task_skills?: unknown;
  surface?: unknown;
};

/** The engine for this request, with the workshop's default brain when none was picked. */
export async function resolveWorkshopAwareEngine(
  sb: SupabaseClient,
  auth: Parameters<typeof resolveBrainEngine>[1],
  body: EngineBody,
  internalAllowed: () => Promise<boolean>,
): Promise<BrainEngine> {
  if (!workshopDefaultApplies(body)) {
    return resolveBrainEngine(sb, auth, body);
  }
  const engine = await resolveBrainEngine(sb, auth, {
    ...body,
    brain_slug: WORKSHOP_BRAIN,
  });
  return withInternalFallback(engine, await internalAllowed());
}

/** A workshop chat turn on the app (not WhatsApp) where the user picked no brain. */
export function workshopDefaultApplies(body: EngineBody) {
  const picked = typeof body.brain_slug === "string" && body.brain_slug !== "";
  const inWorkshop =
    Array.isArray(body.task_skills) && body.task_skills.includes(WORKSHOP_SKIN);
  return inWorkshop && !picked && body.surface !== "whatsapp";
}

/**
 * The default brain never blocks a turn: when it cannot run (missing, refused, not granted) the
 * turn runs on Carmen's own engine, and when it runs, her engine follows it if it fails.
 */
export function withInternalFallback(
  engine: BrainEngine,
  internalAllowed: boolean,
): BrainEngine {
  if (engine.kind !== "connections") {
    return { kind: "internal" };
  }
  return { ...engine, fallbackInternal: internalAllowed };
}
