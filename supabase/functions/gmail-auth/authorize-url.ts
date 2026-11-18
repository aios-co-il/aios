import { GMAIL_SCOPES } from "./scopes.ts";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export interface GmailAuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
}

/** Google's consent screen URL for connecting Gmail. */
export function buildGmailAuthorizeUrl({
  clientId,
  redirectUri,
  state,
}: GmailAuthorizeParams): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTHORIZE_URL}?${params}`;
}
