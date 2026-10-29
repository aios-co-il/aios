import { supabase } from "@/integrations/supabase/client";

/** The signed-in user's Gmail sender address, when Gmail is connected. */
export type GmailConnection = { google_email: string | null };

/**
 * Reads the signed-in user's Gmail connection, or null when Gmail is not
 * connected. gmail_tokens holds the OAuth tokens and has no browser read
 * policy, so this goes through get_user_gmail_connection, which returns the
 * address only.
 */
export async function fetchGmailConnection(): Promise<GmailConnection | null> {
  const { data, error } = await supabase
    .rpc("get_user_gmail_connection")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}
