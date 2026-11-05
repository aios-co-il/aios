/**
 * Which refused Google token refreshes mean the connection is gone (AIO-342).
 * Only these flag a connection needs_reauth, which opens a disconnect and
 * Carmen's lost-connection pulse alert. Anything else (a 5xx, a 429, a
 * network error) fails only the run that met it.
 */
const PERMANENT_GOOGLE_OAUTH_ERRORS = new Set([
  "invalid_grant",
  "unauthorized_client",
  "invalid_client",
]);

/** True when Google's OAuth `error` says the refresh token will never work again. */
export function isPermanentGoogleOAuthError(error: unknown): boolean {
  return typeof error === "string" && PERMANENT_GOOGLE_OAUTH_ERRORS.has(error);
}
