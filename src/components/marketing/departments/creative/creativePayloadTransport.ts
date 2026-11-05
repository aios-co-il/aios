import type { Json } from "@/integrations/supabase/types";

/** Express the existing HTTP JSON representation without validating or normalizing project data. */
export function serializeCreativeProjectPayload(payload: object): Json {
  return JSON.parse(JSON.stringify(payload));
}
