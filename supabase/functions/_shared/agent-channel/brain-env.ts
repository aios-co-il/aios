/**
 * Tenant brain keys from Carmen settings (carmen_brain_connections + Vault).
 * A built-in brain's UI key replaces its env secret for that tenant's sends;
 * without one, the project env secret is used as before.
 */
import { overlayBrainEnv } from "../carmen/brain-connections/env.ts";
import {
  type SecretClient,
  tenantBrainOverrides,
} from "../carmen/brain-connections/overrides.ts";
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

/** Project env with this tenant's UI keys laid over it. */
export async function loadBrainEnv(
  sb: SecretClient,
  tenantId: string,
): Promise<Record<string, string | undefined>> {
  return overlayBrainEnv(
    projectEnv(),
    await tenantBrainOverrides(sb, tenantId),
  );
}

/** The env a launcher should read for this send, loaded once per send. */
export async function sendEnv(
  ctx: SendContext,
): Promise<Record<string, string | undefined>> {
  if (!ctx.env) ctx.env = await loadBrainEnv(serviceClient(), ctx.tenantId);
  return ctx.env;
}
