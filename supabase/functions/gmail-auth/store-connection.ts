import { z } from "npm:zod@3.25.76";
import {
  callbackUri,
  exchangeGoogleCode,
} from "../_shared/google-oauth/exchange-code.ts";
import { missingGrantedScopes } from "../_shared/google-oauth/granted-scopes.ts";
import { UserFacingError } from "../_shared/google-oauth/user-facing-error.ts";
import { serviceClient } from "../_shared/supabase-clients.ts";
import { GMAIL_SCOPES } from "./scopes.ts";

/**
 * Exchanges a Google authorization code and stores the user's Gmail
 * connection for the tenant. Called only from `complete`, after the state was
 * verified for the signed-in user.
 */
export async function storeGmailConnection(
  code: string,
  userId: string,
  tenantId: string,
): Promise<void> {
  const tokens = await exchangeGoogleCode(
    code,
    callbackUri("gmail-auth", null),
  );
  if (!tokens.refresh_token) {
    throw new Error("Google returned no refresh token for Gmail");
  }
  if (missingGrantedScopes(tokens, GMAIL_SCOPES).length > 0) {
    throw new UserFacingError(
      "Gmail permission is missing. Connect Gmail again, allowing Gmail access.",
    );
  }

  const { error } = await serviceClient()
    .from("gmail_tokens")
    .upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
        google_email: await gmailAddress(tokens.access_token),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) {
    throw new Error(`gmail_tokens upsert failed: ${error.message}`);
  }
}

const gmailProfileSchema = z.object({ emailAddress: z.string().optional() });

/** The mailbox address; the Gmail profile uses the same permission as mailbox operations. */
async function gmailAddress(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      console.warn("Gmail profile failed:", response.status);
      return null;
    }
    const profile = gmailProfileSchema.safeParse(await response.json());
    return profile.success ? (profile.data.emailAddress ?? null) : null;
  } catch (e) {
    console.error("Failed to fetch Gmail profile:", e);
    return null;
  }
}
