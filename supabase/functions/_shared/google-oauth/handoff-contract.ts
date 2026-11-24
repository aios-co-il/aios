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
