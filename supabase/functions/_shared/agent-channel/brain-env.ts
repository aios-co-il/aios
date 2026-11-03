/**
 * The env a brain send reads: project env without built-in brain keys, plus
 * each built-in brain's keys from its one source (own, shared, or project
 * for a home tenant). See key-source.ts (AIO-303).
 */
import {
  brainEnvFrom,
  resolveBuiltinKeys,
} from "../carmen/brain-connections/key-source.ts";
import type { SecretClient } from "../carmen/brain-connections/overrides.ts";
import { serviceClient } from "../supabase-clients.ts";
import type { SendContext } from "./types.ts";

/** Project env secrets, or {} where the runtime forbids reading them. */
export function projectEnv(): Record<string, string | undefined> {
  try {
    return Deno.env.toObject();
  } catch {
    return {};
  }
}

/** This tenant's brain env; a brain it may not use has no keys in it. */
export async function loadBrainEnv(
  sb: SecretClient,
  tenantId: string,
): Promise<Record<string, string | undefined>> {
  const project = projectEnv();
  return brainEnvFrom(project, await resolveBuiltinKeys(sb, tenantId, project));
}

/** The env a launcher should read for this send, loaded once per send. */
export async function sendEnv(
  ctx: SendContext,
): Promise<Record<string, string | undefined>> {
  if (!ctx.env) ctx.env = await loadBrainEnv(serviceClient(), ctx.tenantId);
  return ctx.env;
}
