/**
 * The device-wide key the voice pick lived under before it moved to the
 * user's row (carmen_user_choices). useCarmenVoicePick moves a voice a device
 * still holds here onto the row, once. Remove this file and that move with
 * AIO-658.
 */
export const LEGACY_VOICE_STORAGE_KEY = "aios:carmen-voice";

/** The value under the old key, or null when there is none or storage is blocked. */
export function readLegacyVoice(): string | null {
  try {
    return localStorage.getItem(LEGACY_VOICE_STORAGE_KEY);
  } catch {
    // Blocked storage holds no voice to adopt.
    return null;
  }
}

/** Removes the old key once its voice is on the row or is not needed. */
export function clearLegacyVoice(): void {
  try {
    localStorage.removeItem(LEGACY_VOICE_STORAGE_KEY);
  } catch (error) {
    console.warn(
      "[legacyVoiceAdoption] the old voice key was not removed",
      error,
    );
  }
}
