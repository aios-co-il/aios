// What a Google connect callback hands the app, shared by the edge functions
// (handoff-response.ts) and the frontend (src/lib/googleConnect.ts).

/** The functions whose connect the app completes. */
export const GOOGLE_CONNECT_FUNCTIONS = [
  "google-calendar-auth",
  "gmail-auth",
  "google-analytics-auth",
  "google-search-console-auth",
  "google-ads-auth",
] as const;

export type GoogleConnectFunction = (typeof GOOGLE_CONNECT_FUNCTIONS)[number];

/** The `type` of the message a popup posts to the window that opened it. */
export const CONNECT_CODE_MESSAGE = "google_connect_code";

/** The `type` of the message a popup posts when the connect failed before a code was handed over. */
export const CONNECT_ERROR_MESSAGE = "google_connect_error";

/** The URL fragment key a full-page connect carries the provider in. */
export const CONNECT_FRAGMENT_KEY = "google_connect";

/**
 * The error a connect returns with instead of a code: Google's own `error`
 * (access_denied when consent is refused), or ours when the state is not
 * valid. The app shows its own text for each (src/lib/googleConnect.ts).
 */
export const INVALID_STATE_ERROR = "invalid_state";

export const CONSENT_REFUSED_ERROR = "access_denied";

/** How long a returned code is worth completing: Google's authorization codes expire after 10 minutes. */
export const CONNECT_CODE_TTL_MS = 10 * 60 * 1000;

/** The error when Google returned neither a code nor an error. */
export const MISSING_CODE_ERROR = "missing_code";

/** Hosts where callbacks and the app may run on plain http (local development). */
export const LOCAL_HOSTS: ReadonlyArray<string> = ["localhost", "127.0.0.1"];
