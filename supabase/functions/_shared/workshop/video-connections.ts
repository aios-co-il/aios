/**
 * Video engines the tenant connected outside the LLM integration settings. OpenRouter is
 * connected as a Carmen brain; only its existence is read here (the same lookup as the
 * OpenRouter image path). The key stays in Vault and only the render worker reads it.
 */

import type { SecretClient } from "../carmen/brain-connections/overrides.ts";
import { tenantOpenRouterConnectionId } from "../creative/openrouterImage.ts";
import type { VideoConnections } from "./video-cost.ts";

export async function videoConnectionsFor(
  supabase: SecretClient,
  tenantId: string,
): Promise<VideoConnections> {
  try {
    return {
      openrouter: Boolean(
        await tenantOpenRouterConnectionId(supabase, tenantId),
      ),
    };
  } catch {
    return {};
  }
}
