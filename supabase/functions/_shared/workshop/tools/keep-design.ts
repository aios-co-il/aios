/**
 * A finished design (an ad, a poster, a banner with its own text) is kept exactly as it is: the
 * film moves the camera over the original picture instead of sending it to a video model. On
 * Staging (2 Nov) a dive club's poster went to a video model, which redrew it and garbled its
 * Hebrew text. The free preview engine is that camera move; the render also fits the whole
 * picture in the frame (video.keep_design) instead of cropping it.
 */

/** Whether this production keeps the pictures as designed: the call says so, or the film did. */
export function keepsDesign(
  args: Record<string, unknown>,
  video: Record<string, unknown>,
): boolean {
  if (typeof args.keep_design === "boolean") {
    return args.keep_design;
  }
  return video.keep_design === true;
}
