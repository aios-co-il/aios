import { assertMatch, assertStrictEquals } from "jsr:@std/assert@1";
import {
  VOICE_STATUSES,
  buildVoiceCapabilityPromptRule,
  buildVoiceMeta,
  formatVoiceMessageText,
  hasVoiceTranscriptMarker,
  isVoicePlaceholder,
  looksLikeAudioPayload,
  pickAudioUrlFromContainers,
  stripVoiceMarker,
} from "./wa-voice-resolve.mjs";

Deno.test("successful transcript keeps 🎤 marker for Carmen context", () => {
  const text = formatVoiceMessageText({
    transcript: "כרמן, את מצליחה לקרוא הודעות קול?",
    status: VOICE_STATUSES.OK,
    isVoice: true,
  });
  assertStrictEquals(text, "🎤 כרמן, את מצליחה לקרוא הודעות קול?");
  assertStrictEquals(hasVoiceTranscriptMarker(text), true);
  assertStrictEquals(
    stripVoiceMarker(text),
    "כרמן, את מצליחה לקרוא הודעות קול?",
  );
});

Deno.test("paired green transcript must not lose the voice marker", () => {
  // Regression: findPairedGreenTranscript used to strip 🎤 before returning.
  const pairedRaw = "🎤 אבל כרמן את כן קוראת";
  const text = formatVoiceMessageText({
    transcript: stripVoiceMarker(pairedRaw),
    status: VOICE_STATUSES.OK,
    isVoice: true,
  });
  assertStrictEquals(hasVoiceTranscriptMarker(text), true);
  assertMatch(text, /^🎤 /);
});

Deno.test(
  "explicit failure statuses instead of silent media placeholder",
  () => {
    assertStrictEquals(
      formatVoiceMessageText({
        transcript: null,
        status: VOICE_STATUSES.NO_AUDIO_URL,
        isVoice: true,
      }),
      "[הודעת קול · no_audio_url]",
    );
    assertStrictEquals(
      formatVoiceMessageText({
        transcript: null,
        status: VOICE_STATUSES.TRANSCRIPTION_FAILED,
        isVoice: true,
      }),
      "[הודעת קול · transcription_failed]",
    );
    assertStrictEquals(
      formatVoiceMessageText({
        transcript: null,
        status: VOICE_STATUSES.DOWNLOAD_FAILED,
        isVoice: true,
      }),
      "[הודעת קול · download_failed]",
    );
    assertStrictEquals(
      formatVoiceMessageText({
        transcript: null,
        status: VOICE_STATUSES.NOT_VOICE_MEDIA,
        isVoice: false,
      }),
      "[מדיה]",
    );
  },
);

Deno.test("buildVoiceMeta exposes transcript + message_id for storage", () => {
  const meta = buildVoiceMeta({
    status: VOICE_STATUSES.OK,
    transcript: "שלום כרמן",
    source: "green_api_pair",
    messageId: "ABC123",
    audioUrl: null,
    isVoice: true,
  });
  assertStrictEquals(meta.has_transcript, true);
  assertStrictEquals(meta.transcript, "שלום כרמן");
  assertStrictEquals(meta.message_id, "ABC123");
  assertStrictEquals(meta.source, "green_api_pair");
  assertStrictEquals(meta.message_text, "🎤 שלום כרמן");
});

Deno.test("looksLikeAudioPayload and pickAudioUrlFromContainers", () => {
  assertStrictEquals(looksLikeAudioPayload({ hasAudioMessage: true }), true);
  assertStrictEquals(looksLikeAudioPayload({ type: "ptt", url: null }), true);
  assertStrictEquals(
    looksLikeAudioPayload({ type: "image", url: "https://x/a.jpg" }),
    false,
  );
  const url = pickAudioUrlFromContainers([
    { caption: "hi" },
    { downloadUrl: "https://cdn.example/voice.ogg" },
  ]);
  assertStrictEquals(url, "https://cdn.example/voice.ogg");
});

Deno.test("placeholders detected", () => {
  assertStrictEquals(isVoicePlaceholder("[הודעת קול]"), true);
  assertStrictEquals(
    isVoicePlaceholder("[הודעת קול · transcription_failed]"),
    true,
  );
  assertStrictEquals(isVoicePlaceholder("[מדיה]"), true);
  assertStrictEquals(isVoicePlaceholder("🎤 שלום"), false);
});

Deno.test("capability prompt tells Carmen she can read 🎤 transcripts", () => {
  const rule = buildVoiceCapabilityPromptRule();
  assertMatch(rule, /🎤/);
  assertMatch(rule, /כן/);
  assertMatch(rule, /transcription_failed|no_audio_url/);
});
