/**
 * The Chrome and storage calls behind a screenshot (AIO-656), kept thin: every decision is in
 * shotFlow.ts and the modules it imports. The fields are read in the extension's isolated
 * world of every frame the site's grant reaches; the picture is the visible part of the
 * panel window's active tab; the file goes to the signed-in user's own folder of the
 * private Command Center bucket, the only folder its storage policy lets them write.
 */
import { COMMAND_CENTER_FILES_BUCKET } from "../../../supabase/functions/_shared/agent-channel/attachment-bucket.ts";
import { supabase } from "../supabase";
import { ACT_RULES } from "./keptSnapshot.ts";
import { collectFieldFacts } from "./pageFields.ts";
import { CAPTURE_GRANT } from "./siteGrant.ts";

/** The most fields one frame reports: enough for any form, bounded for a page that floods. */
const FIELDS_PER_FRAME = 300;

/** JPEG keeps the picture well under the server's per-picture limit. */
const CAPTURE_QUALITY = 70;

/** The field facts of each frame of the tab the extension may inject into, one entry per frame. */
export async function pageFields(tabId: number): Promise<Array<unknown>> {
  const frames = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: collectFieldFacts,
    args: [ACT_RULES.fields, FIELDS_PER_FRAME],
  });
  return frames.map((frame) => frame.result);
}

/** Chrome's prompt for the capture grant; call it first thing in a click handler, which Chrome requires. */
export function requestCaptureGrant(): Promise<boolean> {
  return chrome.permissions.request({ origins: [CAPTURE_GRANT] });
}

/** Gives the capture grant back. Never rejects: a grant Chrome keeps is logged, and the next panel open drops it. */
export async function dropCaptureGrant(): Promise<void> {
  await chrome.permissions
    .remove({ origins: [CAPTURE_GRANT] })
    .catch((error: unknown) => {
      console.error(
        "[carmen-panel] giving back the capture grant failed",
        error,
      );
    });
}

/** The visible part of the active tab of the panel's own window. */
export function captureTab(): Promise<string> {
  return chrome.tabs.captureVisibleTab({
    format: "jpeg",
    quality: CAPTURE_QUALITY,
  });
}

/** Stores the picture as `<user id>/<time>-tab.jpg`; its path. Rejects without a session or on a refused upload. */
export async function uploadShot(dataUrl: string): Promise<string> {
  // The popup's session, the same one the claim went out with: its user is the action's.
  const { data, error } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (error || !userId) {
    throw new Error("No signed-in user in the extension");
  }
  const path = `${userId}/${Date.now()}-tab.jpg`;
  const bytes = await (await fetch(dataUrl)).blob();
  const upload = await supabase.storage
    .from(COMMAND_CENTER_FILES_BUCKET)
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (upload.error) {
    throw new Error(`Storing the screenshot failed: ${upload.error.message}`);
  }
  return path;
}
