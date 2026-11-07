// One narration take through the first voice engine that can speak it. The engine hears the
// pointed text (vocalize.ts); what it returns is keyed back to the plain script.
import { flagged, finalError } from "../guard.ts";
import {
  SPEECH_MODEL,
  synthesizeSpeech,
} from "../providers/elevenlabsSound.ts";
import { synthesizeGeminiSpeech } from "../providers/geminiTts.ts";
import { synthesizeOpenRouterSpeech } from "../providers/openrouterTts.ts";
import { isPaidPlanError, isRejectedKeyError } from "../providers/plan.ts";
import { stripNikud } from "./nikud.ts";
import { spokenAlignment } from "./spoken-alignment.ts";

/**
 * One take of the script through the first engine that can speak it: ElevenLabs, then
 * OpenRouter, then Gemini. Only the engine hears the nikud (`voiced`); the stored script and its
 * captions stay without it.
 */
export async function speakScript({
  run,
  script,
  voiced,
  apiKey,
  googleKey,
  resolveOpenRouterKey,
  log,
}) {
  if (apiKey) {
    try {
      const speech = await synthesizeSpeech({
        apiKey,
        voiceId: run.input?.voice_id || null,
        text: voiced.text,
      });
      return {
        bytes: speech.bytes,
        contentType: "audio/mpeg",
        meta: {
          provider: "elevenlabs",
          model: SPEECH_MODEL(),
          voice_id: speech.voiceId,
          alignment: spokenAlignment(speech.alignment, voiced.text, script),
          nikud: voiced.nikud,
          ...billedCharacters(speech.characterCost, voiced.text),
        },
      };
    } catch (error) {
      if (!isPaidPlanError(error) && !isRejectedKeyError(error)) {
        throw error;
      }
      log(
        `[voice] ${run.id} ElevenLabs cannot narrate (${isPaidPlanError(error) ? "plan" : "key"}); trying OpenRouter, then Gemini`,
      );
    }
  }
  // A refused request is not billed, so the next route may still be tried.
  const openRouterKey = await resolveOpenRouterKey().catch(() => null);
  if (openRouterKey) {
    try {
      const speech = await synthesizeOpenRouterSpeech({
        apiKey: openRouterKey,
        voiceId: run.input?.voice_id || null,
        text: voiced.text,
      });
      return {
        bytes: speech.bytes,
        contentType: speech.contentType,
        meta: {
          provider: "openrouter",
          model: speech.model,
          voice_id: speech.voice,
          cost_usd: speech.costUsd,
          cost_reported: speech.costReported,
          generation_id: speech.generationId ?? null,
          nikud: voiced.nikud,
        },
      };
    } catch (error) {
      // A failure after OpenRouter charged is final; only a refused request moves on.
      if (flagged(error, "final") || !googleKey) {
        throw error;
      }
      log(
        `[voice] ${run.id} OpenRouter speech failed (${error instanceof Error ? error.message : error}); using Gemini`,
      );
    }
  }
  if (!googleKey) {
    throw finalError(
      apiKey
        ? "קריינות ElevenLabs לא זמינה (תוכנית Pro או מפתח לא תקין), ואין מוח OpenRouter או מפתח Google לקריינות חלופית"
        : "אין מפתח לקריינות: חברו ElevenLabs, מוח OpenRouter או Google",
    );
  }
  const speech = await synthesizeGeminiSpeech({
    apiKey: googleKey,
    text: voiced.text,
  });
  return {
    bytes: speech.bytes,
    contentType: speech.contentType,
    meta: {
      provider: "gemini",
      model: speech.model,
      voice_id: speech.voice,
      cost_usd: speech.costUsd,
      nikud: voiced.nikud,
    },
  };
}

/**
 * The characters ElevenLabs billed: its character-cost header, else the length of the text it was
 * sent without its nikud. ElevenLabs does not bill the vowel points (Staging, 5 Nov: a 96-character
 * script sent with nikud was billed 66), so the pointed length would over-count.
 */
const billedCharacters = (header: number | null, sent: string) =>
  header === null
    ? {
        characters: stripNikud(sent).length,
        characters_basis: "sent_text_without_nikud",
      }
    : { characters: header, characters_basis: "character_cost_header" };
