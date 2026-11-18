import { CALENDAR_SCOPES } from "./scopes.ts";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export interface CalendarAuthorizeParams {
  clientId: string;
  redirectUri: string;
  state: string;
  /** Without a stored refresh token, force consent so Google returns one. */
  forceConsent: boolean;
}

/** Google's consent screen URL for connecting Calendar. */
export function buildCalendarAuthorizeUrl({
  clientId,
  redirectUri,
  state,
  forceConsent,
}: CalendarAuthorizeParams): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    state,
  });

  if (forceConsent) {
    params.set("prompt", "consent");
  }

  return `${GOOGLE_AUTHORIZE_URL}?${params}`;
}
