import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import { resolveEffectivePersona } from "../_shared/carmen/persona-runtime.ts";
import { withGender } from "../_shared/carmen/persona-speaker.ts";
import type { PersonaLook } from "../_shared/carmen/personas.ts";
import { loadOrgAssistantName } from "../_shared/carmen/load-carmen-agent.ts";
import type { MiniMeGender } from "../_shared/carmen/minime-gender.ts";
import { resolveTenantId } from "./agent-profile.ts";

/**
 * The character a client draws and names for the caller in a tenant
 * (`{ persona: true, tenant_id }`), by the same rule the voice session and the
 * app chat answer with, so clients do not re-implement it.
 */
export type EffectivePersonaReply = {
  /** A built-in key ("carmen" | "minime" | "aios"), a `carmen_personas` id, or null for Carmen herself. */
  key: string | null;
  /** The character's name, else the organization's name for Carmen (`orgAssistantName`). */
  display_name: string;
  /** The character's look, else the organization's Carmen style. */
  look: PersonaLook;
  /** The gender the character speaks in: a Mini Me follows the caller's set, else female. */
  gender: MiniMeGender;
};

/** The HTTP status and JSON body for the client. */
export type PersonaReply = {
  status: number;
  body: EffectivePersonaReply | { error: string };
};

type Db = Pick<DbClient, "from" | "rpc">;

/** The tenant the read answers for, or why it answers for none. */
type TenantLookup =
  | { kind: "tenant"; tenantId: string }
  | { kind: "refused" }
  | { kind: "failed" };

const LOG = "[carmen-realtime-session]";

/**
 * The caller's effective character in the tenant they sent (or their active
 * tenant): 403 for a tenant they may not use, 500 when the tenant cannot be
 * resolved.
 */
export async function personaReply(
  callerId: string,
  requestedTenantId: unknown,
  db: Db = serviceClient(),
): Promise<PersonaReply> {
  const lookup = await lookUpTenant(db, callerId, requestedTenantId);
  if (lookup.kind === "failed") {
    return { status: 500, body: { error: "persona_lookup_failed" } };
  }
  if (lookup.kind === "refused") {
    return { status: 403, body: { error: "tenant_not_allowed" } };
  }
  return {
    status: 200,
    body: await effectivePersona(db, lookup.tenantId, callerId),
  };
}

/** The checked tenant (`resolveTenantId`); a failed read is logged. */
async function lookUpTenant(
  db: Db,
  callerId: string,
  requestedTenantId: unknown,
): Promise<TenantLookup> {
  try {
    const tenantId = await resolveTenantId(db, callerId, requestedTenantId);
    return tenantId ? { kind: "tenant", tenantId } : { kind: "refused" };
  } catch (e) {
    console.error(
      `${LOG} persona tenant read failed`,
      e instanceof Error ? e.message : e,
    );
    return { kind: "failed" };
  }
}

/** The character's fields, or Carmen's with the organization's name and style. */
async function effectivePersona(
  db: Db,
  tenantId: string,
  callerId: string,
): Promise<EffectivePersonaReply> {
  const { picked, look } = await resolveEffectivePersona(
    db,
    tenantId,
    callerId,
  );
  const speaker = await withGender(db, picked, callerId);
  if (speaker) {
    const { key, persona, gender } = speaker;
    return { key, display_name: persona.displayName, look, gender };
  }
  return {
    key: null,
    display_name: await loadOrgAssistantName(db, tenantId),
    look,
    gender: "female",
  };
}
