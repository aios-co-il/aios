/**
 * The panel's notice for an extension signed in as another user than the framed site, and
 * its button that signs the extension out so the user can sign in again as the site's user.
 */
import { supabase } from "./supabase";
import { otherUserNotice } from "./userMatch";

let switchWired = false;

/** Shows or hides the notice for the site's user id from its hello; a failed check is logged. */
export function checkSiteUser(siteUserId: string | undefined): void {
  if (!switchWired) {
    wireSwitchUser();
    switchWired = true;
  }
  showOtherUserNotice(siteUserId).catch((error: unknown) => {
    console.error("[carmen-panel] comparing the site's user failed", error);
  });
}

/** Compares the extension's session user with the site's. */
async function showOtherUserNotice(
  siteUserId: string | undefined,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const text = otherUserNotice(siteUserId, session?.user ?? null);

  el("user-notice-text").textContent = text ?? "";
  el("user-notice").classList.toggle("hidden", !text);
}

/** The switch button: sign the extension out, then say how to sign in again. */
function wireSwitchUser(): void {
  el("switch-user").addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("[carmen-panel] signing the extension out failed", error);
      el("user-notice-text").textContent =
        "לא הצלחתי לנתק את התוסף. נסו להתנתק מחלון התוסף (הסמל של AIOS בסרגל הכלים).";
      return;
    }
    el("user-notice").classList.add("hidden");
    el("signin-notice").classList.remove("hidden");
  });
}

/** An element sidepanel.html declares. */
function el(id: string): HTMLElement {
  const found = document.getElementById(id);

  if (!found) {
    throw new Error(`sidepanel.html has no #${id}`);
  }
  return found;
}
