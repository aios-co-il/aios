import { type DbClient, serviceClient } from "../_shared/supabase-clients.ts";
import { loadOrgStyle } from "../_shared/carmen/persona-runtime.ts";
import { PERSONA_LOOKS, type PersonaLook } from "../_shared/carmen/personas.ts";
import { loadOrgAssistantName } from "../_shared/carmen/load-carmen-agent.ts";
import type { MiniMeGender } from "../_shared/carmen/minime-gender.ts";
import { resolveTenantId } from "./agent-profile.ts";
import { loadVoiceCharacter } from "./voice-character.ts";

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
  const tenantId = await tenantOrNull(db, callerId, requestedTenantId);
  if (tenantId === undefined) {
    return { status: 500, body: { error: "persona_lookup_failed" } };
  }
  if (!tenantId) {
    return { status: 403, body: { error: "tenant_not_allowed" } };
  }
  return { status: 200, body: await effectivePersona(db, tenantId, callerId) };
}

/** The checked tenant, null when the caller may not use it, undefined when the read failed (logged). */
async function tenantOrNull(
  db: Db,
  callerId: string,
  requestedTenantId: unknown,
): Promise<string | null | undefined> {
  try {
    return await resolveTenantId(db, callerId, requestedTenantId);
  } catch (e) {
    console.error(
      `${LOG} persona tenant read failed`,
      e instanceof Error ? e.message : e,
    );
    return undefined;
  }
}

/** The character's fields, or Carmen's with the organization's name and style. */
async function effectivePersona(
  db: Db,
  tenantId: string,
  callerId: string,
): Promise<EffectivePersonaReply> {
  const { picked, gender } = await loadVoiceCharacter(db, tenantId, callerId);
  if (picked) {
    const { key, persona } = picked;
    return {
      key,
      display_name: persona.displayName,
      look: persona.look,
      gender,
    };
  }
  const [displayName, orgStyle] = await Promise.all([
    loadOrgAssistantName(db, tenantId),
    loadOrgStyle(db, tenantId),
  ]);
  return {
    key: null,
    display_name: displayName,
    look: orgStyle ?? PERSONA_LOOKS[0],
    gender,
  };
}
