import { supabase } from "@/integrations/supabase/client";
import type { MicrosoftConnectionStatus } from "@functions/microsoft-auth/types.ts";

/** Query key shared by every reader of the Microsoft connection, so connect and disconnect refresh them all. */
export const MICROSOFT_STATUS_QUERY_KEY = ["microsoft-status"] as const;

/** The signed-in user's Microsoft connection, from microsoft-auth (never the tokens). */
export async function fetchMicrosoftStatus(): Promise<MicrosoftConnectionStatus> {
  const { data, error } =
    await supabase.functions.invoke<MicrosoftConnectionStatus>(
      "microsoft-auth",
      { body: { action: "status" } },
    );
  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("microsoft-auth returned no status");
  }
  return data;
}
