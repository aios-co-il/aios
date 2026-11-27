/** A Google OAuth client's credentials. */
export type GoogleClient = { clientId: string; clientSecret: string };

/** The client every Google connection except Gmail uses. Throws when it is not configured. */
export function sharedGoogleClient(): GoogleClient {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set");
  }

  return { clientId, clientSecret };
}

/**
 * The client Gmail connects and refreshes with. Gmail's permission is
 * restricted, so Google reviews it apart from the other permissions when it
 * has its own Google project: GMAIL_GOOGLE_CLIENT_ID and
 * GMAIL_GOOGLE_CLIENT_SECRET name that project's client. Without them Gmail
 * shares the client of the other connections. A refresh token works only with
 * the client that issued it, so users connect Gmail again after a switch.
 */
export function gmailGoogleClient(): GoogleClient {
  const clientId = Deno.env.get("GMAIL_GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GMAIL_GOOGLE_CLIENT_SECRET");
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }
  if (clientId || clientSecret) {
    throw new Error(
      "GMAIL_GOOGLE_CLIENT_ID and GMAIL_GOOGLE_CLIENT_SECRET must be set together",
    );
  }

  return sharedGoogleClient();
}
