/**
 * The popup's "sign in with Google" button. The background worker runs the flow, since the
 * popup closes when Google's window opens; a failure it could not deliver is shown the next
 * time the popup opens.
 */
import {
  failure,
  GOOGLE_SIGN_IN_FAILURE_KEY,
  GOOGLE_SIGN_IN_MESSAGE,
  type GoogleSignInRequest,
  type GoogleSignInResult,
  isGoogleSignInResult,
} from "./googleSignIn";

const BUTTON_TEXT = "התחברות עם Google";

/** Wires the button: on success `onSignedIn` runs, on failure `showError` gets the Hebrew line. */
export function wireGoogleSignIn(
  button: HTMLButtonElement,
  onSignedIn: () => Promise<void>,
  showError: (message: string | null) => void,
): void {
  button.addEventListener("click", async () => {
    showError(null);
    button.disabled = true;
    button.textContent = "פותח את Google...";

    const result = await requestGoogleSignIn();

    button.disabled = false;
    button.textContent = BUTTON_TEXT;
    if (!result.ok) {
      await chrome.storage.local.remove(GOOGLE_SIGN_IN_FAILURE_KEY);
      showError(result.message);
      return;
    }
    await onSignedIn();
  });
}

/** The failure of a sign-in that ended while the popup was closed, once; null when there is none. */
export async function takeStoredGoogleFailure(): Promise<string | null> {
  const stored = await chrome.storage.local.get(GOOGLE_SIGN_IN_FAILURE_KEY);
  const message: unknown = stored[GOOGLE_SIGN_IN_FAILURE_KEY];

  if (typeof message !== "string") {
    return null;
  }
  await chrome.storage.local.remove(GOOGLE_SIGN_IN_FAILURE_KEY);
  return message;
}

/** Asks the background worker to sign in; a broken reply is a logged failure. */
async function requestGoogleSignIn(): Promise<GoogleSignInResult> {
  const request: GoogleSignInRequest = { type: GOOGLE_SIGN_IN_MESSAGE };

  try {
    const reply: unknown = await chrome.runtime.sendMessage(request);
    return isGoogleSignInResult(reply)
      ? reply
      : failure("no reply from the extension");
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  }
}
