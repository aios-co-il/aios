import { z } from "npm:zod@3.25.76";
import { tokenErrorSummary } from "./token-error.ts";

const googleTokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number(),
  scope: z.string().optional(),
});

export type GoogleTokens = z.infer<typeof googleTokensSchema>;

/** Google's tokens for an authorization code. The redirect URI must be the one the code was issued for. */
export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<GoogleTokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") ?? "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body: unknown = await response.json();
  const tokens = googleTokensSchema.safeParse(body);
  if (!tokens.success) {
    console.error("Token exchange failed:", tokenErrorSummary(body));
    throw new Error("Failed to get tokens from Google");
  }

  return tokens.data;
}

/**
 * The redirect URI of a connect function's callback, which the code exchange
 * must repeat. PUBLIC_API_URL is the project's custom domain (for example
 * https://api.aios.co.il), so Google shows our domain; without it the URI
 * uses SUPABASE_URL, which stays the project's supabase.co address.
 */
export function callbackUri(
  functionName: string,
  action: string | null,
): string {
  const uri = `${apiOrigin()}/functions/v1/${functionName}`;

  return action ? `${uri}?action=${action}` : uri;
}

const apiOriginSchema = z
  .string()
  .url()
  .pipe(
    z
      .string()
      .transform((value) => new URL(value))
      .refine((url) => url.protocol === "https:" || url.protocol === "http:")
      .transform((url) => url.origin),
  );

function apiOrigin(): string {
  const configured =
    Deno.env.get("PUBLIC_API_URL") || Deno.env.get("SUPABASE_URL");
  const origin = apiOriginSchema.safeParse(configured);
  if (!origin.success) {
    throw new Error(
      "PUBLIC_API_URL or SUPABASE_URL must be an http(s) URL such as https://api.aios.co.il",
    );
  }

  return origin.data;
}

const userInfoSchema = z.object({ email: z.string().optional() });

/** The Google account's address, or "" when Google does not say. */
export async function googleAccountEmail(accessToken: string): Promise<string> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) {
      console.warn("Google userinfo failed:", response.status);
      return "";
    }
    const info = userInfoSchema.safeParse(await response.json());
    return info.success ? (info.data.email ?? "") : "";
  } catch (e) {
    console.error("Failed to fetch Google user info:", e);
    return "";
  }
}
