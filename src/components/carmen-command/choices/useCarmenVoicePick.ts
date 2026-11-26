import { useEffect, useRef } from "react";
import { toCarmenVoice } from "../carmenVoices";
import { clearLegacyVoice, readLegacyVoice } from "./legacyVoiceAdoption";
import { useCarmenChoices } from "./useCarmenChoices";

/**
 * The voice the user picked for Carmen's live conversation, from their stored
 * picks, and the write that changes it. A stored id this app does not know
 * reads as no pick (Carmen's configured voice).
 */
export function useCarmenVoicePick(tenantId: string | null) {
  const { voice, answered, saveVoice } = useCarmenChoices(tenantId);

  // Moves a voice picked before picks were stored per user onto the user's
  // row, once, so nobody's voice resets. The row wins: the device's old voice
  // is adopted only while the row has none, and the old key is dropped either
  // way, so a later "Carmen's default" pick is not undone by it. One attempt
  // per mount: a refused save keeps the old key for the next open.
  // Remove with AIO-658.
  const legacyHandledRef = useRef(false);
  useEffect(() => {
    if (!answered || legacyHandledRef.current) {
      return;
    }

    legacyHandledRef.current = true;
    const legacyVoice = voice ? null : toCarmenVoice(readLegacyVoice());
    if (legacyVoice) {
      saveVoice(legacyVoice, { onSuccess: clearLegacyVoice });
    } else {
      clearLegacyVoice();
    }
  }, [answered, voice, saveVoice]);

  // Until the server answers, a device that still holds its old voice speaks
  // it, so a slow or failed read does not fall to Carmen's default voice.
  const heldVoice = voice ?? (answered ? null : readLegacyVoice());
  return { voice: toCarmenVoice(heldVoice), saveVoice };
}
