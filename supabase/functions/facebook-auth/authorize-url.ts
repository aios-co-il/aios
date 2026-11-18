import { FACEBOOK_LOGIN_SCOPES } from "./scopes.ts";

const FACEBOOK_OAUTH_DIALOG_URL = "https://www.facebook.com/v21.0/dialog/oauth";

export interface FacebookAuthorizeParams {
  appId: string;
  callbackUrl: string;
  state: string;
}

/** The Facebook Login dialog URL the user is sent to when connecting. */
export function buildFacebookAuthorizeUrl({
  appId,
  callbackUrl,
  state,
}: FacebookAuthorizeParams): string {
  const url = new URL(FACEBOOK_OAUTH_DIALOG_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", FACEBOOK_LOGIN_SCOPES.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");

  return url.toString();
}
