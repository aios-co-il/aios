/**
 * The extension's service worker. It runs the Google sign-in for the popup: Chrome closes
 * the popup when Google's window takes focus, and the worker may wait on
 * `identity.launchWebAuthFlow` past its usual time limit (Chrome 116+).
 */
import {
  failure,
  GOOGLE_REDIRECT_PATH,
  GOOGLE_SIGN_IN_FAILURE_KEY,
  type GoogleSignInResult,
  isGoogleSignInRequest,
  signInWithGoogle,
} from "./googleSignIn";
import { supabase } from "./supabase";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isGoogleSignInRequest(message)) {
    return false;
  }
  void runGoogleSignIn().then(sendResponse);
  return true;
});

/** Signs in with Google, and keeps a failure for a popup that has closed meanwhile. */
async function runGoogleSignIn(): Promise<GoogleSignInResult> {
  await chrome.storage.local.remove(GOOGLE_SIGN_IN_FAILURE_KEY);
  const result = await signInWithGoogle({
    auth: supabase.auth,
    launchWebAuthFlow: (url) =>
      chrome.identity.launchWebAuthFlow({ url, interactive: true }),
    redirectUrl: chrome.identity.getRedirectURL(GOOGLE_REDIRECT_PATH),
  }).catch((error: unknown) =>
    failure(error instanceof Error ? error.message : String(error)),
  );

  if (!result.ok) {
    await chrome.storage.local.set({
      [GOOGLE_SIGN_IN_FAILURE_KEY]: result.message,
    });
  }
  return result;
}
