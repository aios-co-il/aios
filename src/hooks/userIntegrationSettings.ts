import type { Json } from "@/integrations/supabase/types";

/** Decode the settings JSON boundary before exposing it to client mappers. */
export function readIntegrationSettings(settings: Json | null) {
  if (
    settings === null ||
    (typeof settings === "object" && !Array.isArray(settings))
  ) {
    return settings;
  }
  console.error("Ignoring malformed integration settings");
  return null;
}
