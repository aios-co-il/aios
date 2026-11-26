/**
 * A surface without a brain picker (the in-app dialog) sends `use_brain_pick`
 * to run on the brain the signed-in user stored for the organization
 * (carmen_user_choices). The stored pick runs under the rules of the
 * workshop's default brain (workshop-brain.ts): it never blocks a turn. When
 * it is gone, hidden, not granted, not ready or a direct brain, the turn runs
 * as if nothing were stored, and when it runs, Carmen's own engine follows it
 * on failure if the user holds that grant.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import {
  type BrainEngine,
  resolveBrainEngine,
} from "../_shared/carmen/brain-engine/load.ts";
import {
  namesBrain,
  USE_BRAIN_PICK,
} from "../_shared/carmen/brain-engine/stored-pick.ts";
import {
  resolveWorkshopAwareEngine,
  withInternalFallback,
} from "../_shared/carmen/brain-engine/workshop-brain.ts";
import type { DbClient } from "../_shared/supabase-clients.ts";
import { errorMessage } from "./error-message.ts";

type Caller = Parameters<typeof resolveBrainEngine>[1];

type EngineBody = Parameters<typeof resolveWorkshopAwareEngine>[2] & {
  [USE_BRAIN_PICK]?: unknown;
};

/** The two engine resolvers, passed in so tests run without keys or a network. */
export type PickEngineResolvers = {
  resolveBrainEngine: typeof resolveBrainEngine;
  resolveWorkshopAwareEngine: typeof resolveWorkshopAwareEngine;
};

/**
 * The engine for this request: the user's stored pick when the request asks
 * for it and it can run for them, else whatever the request would get without
 * one (a brain it names, the workshop's default, Carmen's own engine).
 */
export async function resolvePickAwareEngine(
  sb: SupabaseClient,
  auth: Caller,
  body: EngineBody,
  internalAllowed: () => Promise<boolean>,
  resolvers: PickEngineResolvers = {
    resolveBrainEngine,
    resolveWorkshopAwareEngine,
  },
): Promise<BrainEngine> {
  const slug = await loadStoredPick(sb, auth, body);
  const picked = slug
    ? await storedPickEngine(sb, auth, body, slug, resolvers)
    : null;
  if (picked) {
    return withInternalFallback(picked, await internalAllowed());
  }

  return resolvers.resolveWorkshopAwareEngine(sb, auth, body, internalAllowed);
}

/**
 * The brain the caller stored, when the request asks for it; null when it does
 * not ask, nothing is stored or the row cannot be read. The query filters by
 * the body's tenant_id, which run-ai-agent checked against the caller's
 * membership (runTenantDenied) before the engine is resolved.
 */
export async function loadStoredPick(
  sb: Pick<DbClient, "from">,
  auth: Caller,
  body: EngineBody,
): Promise<string | null> {
  const key = storedPickRequest(auth, body);
  if (!key) {
    return null;
  }

  const { data, error } = await sb
    .from("carmen_user_choices")
    .select("brain_slug")
    .eq("tenant_id", key.tenantId)
    .eq("user_id", key.userId)
    .maybeSingle();
  if (error) {
    console.error(
      `[stored-brain-pick] carmen_user_choices read failed for tenant ${key.tenantId}: ${error.message}`,
    );
    return null;
  }

  return data?.brain_slug ?? null;
}

/**
 * The stored row this request asks for, or null when it does not ask: only a
 * signed-in user who sent the flag as `true`, named a tenant and named no
 * brain. A brain named in the body always wins over the stored one.
 */
export function storedPickRequest(
  auth: Caller,
  body: EngineBody,
): { tenantId: string; userId: string } | null {
  if (body[USE_BRAIN_PICK] !== true || namesBrain(body)) {
    return null;
  }
  if (auth?.kind !== "user" || !auth.userId) {
    return null;
  }
  if (typeof body.tenant_id !== "string" || !body.tenant_id) {
    return null;
  }

  return { tenantId: body.tenant_id, userId: auth.userId };
}

/**
 * The stored pick's engine when it runs Carmen's loop for this user, else
 * null. The engine resolver owns every rule (route, grant, connection, client
 * data, and that "internal" or a direct brain is no model brain); here its
 * refusals, and a read it could not finish, mean "no pick" and are logged, so
 * a surface with no picker and no refusal message still leaves a trace.
 */
async function storedPickEngine(
  sb: SupabaseClient,
  auth: Caller,
  body: EngineBody,
  slug: string,
  resolvers: PickEngineResolvers,
): Promise<BrainEngine | null> {
  // The slug is text the user stored: quoted, it cannot break the log line.
  const stored = `tenant ${body.tenant_id}, brain ${JSON.stringify(slug)}`;
  try {
    const engine = await resolvers.resolveBrainEngine(sb, auth, {
      ...body,
      brain_slug: slug,
    });
    if (engine.kind === "connections") {
      return engine;
    }
    if (engine.kind !== "internal") {
      const outcome =
        engine.kind === "refused" ? `refused, ${engine.message}` : engine.kind;
      console.error(
        `[stored-brain-pick] the stored brain was dropped (${stored}): ${outcome}`,
      );
    }

    return null;
  } catch (error) {
    console.error(
      `[stored-brain-pick] the stored brain could not be resolved (${stored}): ${errorMessage(error)}`,
    );
    return null;
  }
}
