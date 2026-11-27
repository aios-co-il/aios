/**
 * Sign-in with Google, as on the site: Supabase Auth runs the Google step with the Google
 * client the site already uses and returns a one-time PKCE code to the extension's
 * `https://<extension id>.chromiumapp.org/` address, where Chrome's identity API catches it.
 * The extension holds no client secret; the code is exchanged with the verifier that
 * supabase-js stored when the flow started.
 */
/** The popup's request to the background worker, which outlives the popup closing. */
export const GOOGLE_SIGN_IN_MESSAGE = "aios:google-sign-in";

/** Where a failure waits for the popup when the popup closed while Google's window was open. */
export const GOOGLE_SIGN_IN_FAILURE_KEY = "googleSignInFailure";

/**
 * The path under the extension's chromiumapp.org address that Supabase redirects to.
 * Each project's Auth redirect list allows exactly this address (supabase/config.toml).
 */
export const GOOGLE_REDIRECT_PATH = "auth";

export const GOOGLE_SIGN_IN_TEXT = {
  cancelled:
    "ההתחברות עם Google בוטלה או שהחלון נסגר. אם החלון הציג את אתר AIOS במקום להיסגר לבד, כתובת התוסף עוד לא מוגדרת בהגדרות ההתחברות של AIOS.",
  unreachable:
    "לא הצלחתי לפתוח את דף ההתחברות של Google. כדאי לבדוק את החיבור לאינטרנט ולנסות שוב.",
  failed: "ההתחברות עם Google נכשלה",
} as const;

export type GoogleSignInRequest = { type: typeof GOOGLE_SIGN_IN_MESSAGE };

export type GoogleSignInResult = { ok: true } | { ok: false; message: string };

/** The two Supabase Auth calls the flow makes, as far as it reads them; `supabase.auth` fits. */
export type GoogleAuth = {
  signInWithOAuth: (credentials: {
    provider: "google";
    options: { redirectTo: string; skipBrowserRedirect: boolean };
  }) => Promise<{
    data: { url: string | null };
    error: { message: string } | null;
  }>;
  exchangeCodeForSession: (
    code: string,
  ) => Promise<{ error: { message: string } | null }>;
};

export type GoogleSignInDeps = {
  auth: GoogleAuth;
  /** chrome.identity.launchWebAuthFlow, interactive: the address the provider ended on. */
  launchWebAuthFlow: (url: string) => Promise<string | undefined>;
  /** chrome.identity.getRedirectURL(GOOGLE_REDIRECT_PATH). */
  redirectUrl: string;
};

/** What Chrome says when the user closes the window, and when the first page fails to load. */
const CHROME_CANCELLED = "did not approve";
const CHROME_UNREACHABLE = "could not be loaded";

/** Runs the whole flow; the session lands in the client's storage on success. */
export async function signInWithGoogle(
  deps: GoogleSignInDeps,
): Promise<GoogleSignInResult> {
  const start = await deps.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: deps.redirectUrl, skipBrowserRedirect: true },
  });
  if (start.error || !start.data.url) {
    return failure(start.error?.message ?? "no sign-in address");
  }

  let returned: string | undefined;
  try {
    returned = await deps.launchWebAuthFlow(start.data.url);
  } catch (error) {
    return flowFailure(error);
  }

  const reading = readRedirect(returned, deps.redirectUrl);
  if ("cancelled" in reading) {
    return { ok: false, message: GOOGLE_SIGN_IN_TEXT.cancelled };
  }
  if ("error" in reading) {
    return failure(reading.error);
  }

  const { error } = await deps.auth.exchangeCodeForSession(reading.code);
  return error ? failure(error.message) : { ok: true };
}

/**
 * The code in the address Supabase redirected to, or why there is none. Supabase puts an
 * error in the query and, for some errors, in the fragment.
 */
export function readRedirect(
  returned: string | undefined,
  redirectUrl: string,
): { code: string } | { error: string } | { cancelled: true } {
  const url = returned && URL.canParse(returned) ? new URL(returned) : null;
  if (!url || `${url.origin}${url.pathname}` !== redirectUrl) {
    return { error: "the sign-in did not return to the extension" };
  }

  const fragment = new URLSearchParams(url.hash.slice(1));
  const error = url.searchParams.get("error") ?? fragment.get("error");
  if (error === "access_denied") {
    return { cancelled: true };
  }
  if (error) {
    return {
      error:
        url.searchParams.get("error_description") ??
        fragment.get("error_description") ??
        error,
    };
  }

  const code = url.searchParams.get("code");
  return code ? { code } : { error: "no code in the sign-in address" };
}

/** Whether a runtime message is the popup's request. */
export function isGoogleSignInRequest(
  message: unknown,
): message is GoogleSignInRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === GOOGLE_SIGN_IN_MESSAGE
  );
}

/** Narrows the background worker's reply. */
export function isGoogleSignInResult(
  reply: unknown,
): reply is GoogleSignInResult {
  if (typeof reply !== "object" || reply === null || !("ok" in reply)) {
    return false;
  }
  return (
    reply.ok === true ||
    (reply.ok === false &&
      "message" in reply &&
      typeof reply.message === "string")
  );
}

/** The failure for an error Chrome's identity API threw. */
function flowFailure(error: unknown): GoogleSignInResult {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes(CHROME_CANCELLED)) {
    return { ok: false, message: GOOGLE_SIGN_IN_TEXT.cancelled };
  }
  if (message.includes(CHROME_UNREACHABLE)) {
    console.error("[google-sign-in] Google's page did not load", message);
    return { ok: false, message: GOOGLE_SIGN_IN_TEXT.unreachable };
  }
  return failure(message);
}

/** A logged failure, with the reason after the Hebrew line. */
export function failure(reason: string): GoogleSignInResult {
  console.error("[google-sign-in] failed", reason);
  return { ok: false, message: `${GOOGLE_SIGN_IN_TEXT.failed}: ${reason}` };
}
