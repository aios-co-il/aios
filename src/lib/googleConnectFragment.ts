import { z } from "zod";
import {
  CONNECT_FRAGMENT_KEY,
  GOOGLE_CONNECT_FUNCTIONS,
  type GoogleConnectFunction,
} from "../../supabase/functions/_shared/google-oauth/handoff-contract.ts";
import { connectCodeSchema, type GoogleConnectCode } from "./googleConnect";

/**
 * A full-page connect (Analytics, Search Console, Ads) returns to the app with
 * the code, or Google's error, in the URL fragment. A redirect before the app
 * shell mounts (sign-in after an expired session) drops the fragment, so it is
 * moved to sessionStorage at startup and read back once the user is signed in.
 */

export type FragmentConnect =
  | { code: GoogleConnectCode }
  | { provider: GoogleConnectFunction; error: string };

const fragmentErrorSchema = z.object({
  provider: z.enum(GOOGLE_CONNECT_FUNCTIONS),
  error: z.string().min(1),
});

const pendingSchema = z.union([
  z.object({ code: connectCodeSchema }),
  fragmentErrorSchema,
]);

const PENDING_CONNECT_KEY = "aios-google-connect";

/** The connect a full-page flow left in the URL fragment, or null. */
export function fragmentConnect(hash: string): FragmentConnect | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = connectCodeSchema.safeParse({
    provider: params.get(CONNECT_FRAGMENT_KEY),
    code: params.get("code"),
    state: params.get("state"),
  });
  if (code.success) {
    return { code: code.data };
  }

  const failure = fragmentErrorSchema.safeParse({
    provider: params.get(CONNECT_FRAGMENT_KEY),
    error: params.get("error"),
  });

  return failure.success ? failure.data : null;
}

/** Moves a connect in the URL fragment to sessionStorage and clears the fragment, so a reload never sends the code twice. */
export function stashFragmentConnect(): void {
  const connect = fragmentConnect(window.location.hash);
  if (!connect) {
    return;
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  try {
    sessionStorage.setItem(PENDING_CONNECT_KEY, JSON.stringify(connect));
  } catch (error) {
    console.error(
      "Could not keep the Google connect for after sign-in:",
      error,
    );
  }
}

/** The stashed connect, removed so it is handled once; null when there is none. */
export function takeStashedConnect(): FragmentConnect | null {
  try {
    const raw = sessionStorage.getItem(PENDING_CONNECT_KEY);
    sessionStorage.removeItem(PENDING_CONNECT_KEY);
    if (!raw) {
      return null;
    }
    const pending = pendingSchema.safeParse(JSON.parse(raw));
    return pending.success ? pending.data : null;
  } catch (error) {
    console.error("Could not read the pending Google connect:", error);
    return null;
  }
}
