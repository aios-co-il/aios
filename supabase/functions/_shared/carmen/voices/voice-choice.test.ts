import { assertEquals } from "jsr:@std/assert@1";
import {
  chooseRealtimeVoice,
  chooseSpeechVoice,
  DEFAULT_SPEECH_VOICE,
  REALTIME_VOICES,
  SPEECH_VOICES,
} from "./voice-choice.ts";

Deno.test("the user's pick wins over Carmen's configured voice", () => {
  assertEquals(chooseRealtimeVoice("cedar", "shimmer"), "cedar");
});

Deno.test("without a pick, Carmen speaks her configured voice", () => {
  assertEquals(chooseRealtimeVoice(undefined, "shimmer"), "shimmer");
});

Deno.test("an unknown pick falls back to Carmen's configured voice", () => {
  assertEquals(chooseRealtimeVoice("robot", "sage"), "sage");
});

Deno.test("TTS-only agent voices map to the closest Realtime voice", () => {
  assertEquals(chooseRealtimeVoice(undefined, "nova"), "coral");
  assertEquals(chooseRealtimeVoice(undefined, "fable"), "ballad");
  assertEquals(chooseRealtimeVoice(undefined, "onyx"), "cedar");
});

Deno.test("with no usable voice, Carmen speaks marin", () => {
  assertEquals(chooseRealtimeVoice(undefined, null), "marin");
  assertEquals(chooseRealtimeVoice(undefined, "none"), "marin");
});

Deno.test("chooseSpeechVoice", async (t) => {
  await t.step("the first speakable candidate wins", () => {
    assertEquals(chooseSpeechVoice(["cedar", "shimmer"]), {
      voice: "cedar",
      skipped: [],
    });
  });

  await t.step("TTS-only voices are spoken as they are", () => {
    assertEquals(chooseSpeechVoice([null, "nova"]).voice, "nova");
  });

  await t.step("an ElevenLabs pick falls back to the next candidate", () => {
    assertEquals(chooseSpeechVoice(["yael", "sage"]), {
      voice: "sage",
      skipped: [
        {
          voice: "yael",
          reason:
            "an ElevenLabs voice, whose audio is not confirmed as a WhatsApp voice note",
        },
      ],
    });
  });

  await t.step("an unknown id falls back to the default, reported", () => {
    assertEquals(chooseSpeechVoice(["robot", null]), {
      voice: DEFAULT_SPEECH_VOICE,
      skipped: [
        {
          voice: "robot",
          reason: "not a text-to-speech voice (a Realtime-only or unknown id)",
        },
      ],
    });
  });

  await t.step("no candidate speaks the default and reports nothing", () => {
    assertEquals(chooseSpeechVoice([null, undefined, ""]), {
      voice: "shimmer",
      skipped: [],
    });
  });

  await t.step("every Realtime voice is a text-to-speech voice", () => {
    for (const voice of REALTIME_VOICES) {
      assertEquals(SPEECH_VOICES.has(voice), true, voice);
    }
  });
});
