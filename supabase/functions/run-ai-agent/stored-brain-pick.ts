/**
 * A surface without a brain picker (the in-app dialog) sends `use_brain_pick`
 * to run on the brain the signed-in user stored for the organization
 * (carmen_user_choices). The stored pick runs under the rules of the
 * workshop's default brain (workshop-brain.ts): it never blocks a turn. When
 * it is gone, hidden, not granted, not ready or a direct brain, the turn runs
 * as if nothing were stored, and when it runs, Carmen's own engine follows it
 * on failure if the user holds that grant.
 *
 * A personal WhatsApp line asks the same way for its owner's stored brain
 * (AIO-654). The webhook calls with the service key, so the owner stands in
 * as the user only here, for the row and for the brain's grant; every other
 * check of the turn still sees the service caller. What a signed-in user's
 * request has already proved is checked for the owner first
 * (line-owner-pick.ts), and the owner's grant must be read, not assumed.
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
import {
  lineOwnerMayPick,
  logLineOwnerPick,
  personalLineOwner,
} from "./line-owner-pick.ts";

type Caller = Parameters<typeof resolveBrainEngine>[1];

type EngineBody = Parameters<typeof resolveWorkshopAwareEngine>[2] & {
  [USE_BRAIN_PICK]?: unknown;
  persona_user_id?: unknown;
};

/**
 * Whose stored row a request asks for. `lineOwner` marks the owner of a
 * personal WhatsApp line, named by a service caller instead of signed in.
 */
export type StoredPickRequest = {
  tenantId: string;
  userId: string;
  lineOwner: boolean;
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
  const request = storedPickRequest(auth, body);
  const picked = request
    ? await requestedPickEngine(sb, request, body, resolvers)
    : null;
  if (picked) {
    return withInternalFallback(picked, await internalAllowed());
  }

  return resolvers.resolveWorkshopAwareEngine(sb, auth, body, internalAllowed);
}

/**
 * The stored row this request asks for, or null when it does not ask: the
 * flag sent as `true`, a tenant named and no brain named, by a signed-in user
 * (their own row) or by a service caller for the owner of a personal WhatsApp
 * line (the owner's row). A brain named in the body always wins over the
 * stored one.
 */
export function storedPickRequest(
  auth: Caller,
  body: EngineBody,
): StoredPickRequest | null {
  if (body[USE_BRAIN_PICK] !== true || namesBrain(body)) {
    return null;
  }
  if (typeof body.tenant_id !== "string" || !body.tenant_id) {
    return null;
  }

  const lineOwner = auth?.kind === "service" ? personalLineOwner(body) : null;
  const userId = auth?.kind === "user" ? auth.userId : lineOwner;

  return userId
    ? { tenantId: body.tenant_id, userId, lineOwner: lineOwner !== null }
    : null;
}

/**
 * The engine of the brain stored in the requested row, or null when no stored
 * brain runs. The row is read first, so a line whose owner stored nothing
 * costs one read and logs nothing.
 */
async function requestedPickEngine(
  sb: SupabaseClient,
  request: StoredPickRequest,
  body: EngineBody,
  resolvers: PickEngineResolvers,
): Promise<BrainEngine | null> {
  const slug = await readStoredPick(sb, request);
  if (!slug) {
    return null;
  }

  const stored = pickLabel(request, slug);
  if (
    request.lineOwner &&
    !(await lineOwnerMayPick(sb, request, body.agent_id, stored))
  ) {
    return null;
  }

  return storedPickEngine(sb, request, body, slug, stored, resolvers);
}

/**
 * The brain stored in the requested row; null when nothing is stored or the
 * row cannot be read. The query filters by the body's tenant_id, which
 * run-ai-agent checked against a signed-in caller's membership
 * (runTenantDenied) before the engine is resolved; a line owner's membership
 * is checked before their stored brain is used (lineOwnerMayPick).
 */
async function readStoredPick(
  sb: Pick<DbClient, "from">,
  request: StoredPickRequest,
): Promise<string | null> {
  const { data, error } = await sb
    .from("carmen_user_choices")
    .select("brain_slug")
    .eq("tenant_id", request.tenantId)
    .eq("user_id", request.userId)
    .maybeSingle();
  if (error) {
    console.error(
      `[stored-brain-pick] carmen_user_choices read failed (${pickLabel(request)}): ${error.message}`,
    );
    return null;
  }

  return data?.brain_slug ?? null;
}

/**
 * What a log line says about the pick: the tenant, the stored brain once it
 * is known and, on a personal WhatsApp line, the owner. Never message text.
 */
function pickLabel(request: StoredPickRequest, slug?: string): string {
  // The slug is text the user stored: quoted, it cannot break the log line.
  const brain = slug === undefined ? "" : `, brain ${JSON.stringify(slug)}`;
  const owner = request.lineOwner ? `, line owner ${request.userId}` : "";

  return `tenant ${request.tenantId}${brain}${owner}`;
}

/**
 * The stored pick's engine when it runs Carmen's loop for this user, else
 * null. The engine resolver owns every rule (route, grant, connection, client
 * data, and that "internal" or a direct brain is no model brain); here its
 * refusals, and a read it could not finish, mean "no pick" and are logged, so
 * a surface with no picker and no refusal message still leaves a trace. The
 * resolver runs as the user whose row it is, so a line owner's pick passes
 * the owner's grant, which for an owner must be read (`strictGrant`): nobody
 * is there to notice a brain that ran ungranted. A pick that runs on a
 * personal line is logged too; `stored` is the pick's log label.
 */
async function storedPickEngine(
  sb: SupabaseClient,
  request: StoredPickRequest,
  body: EngineBody,
  slug: string,
  stored: string,
  resolvers: PickEngineResolvers,
): Promise<BrainEngine | null> {
  try {
    const engine = await resolvers.resolveBrainEngine(
      sb,
      { kind: "user", userId: request.userId },
      { ...body, brain_slug: slug },
      { strictGrant: request.lineOwner },
    );
    if (engine.kind === "connections") {
      if (request.lineOwner) {
        logLineOwnerPick(stored);
      }

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
