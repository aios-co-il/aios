// Carmen's live voice on ElevenLabs in the browser (AIO-505). carmen-realtime-session returns a
// signed URL for the environment's agent plus her instructions, sent here as conversation
// overrides, the same session the Android app runs. The agent's client tools run in this tab.
import { Conversation } from "@elevenlabs/client";
import type { RealtimeCallbacks, RealtimeHandle } from "./realtimeVoice";

/** What carmen-realtime-session returns for `provider: "elevenlabs"`. */
export type ElevenLabsSession = {
  signed_url: string;
  prompt: string;
  first_message: string;
  language: string;
  voice_id: string;
};

// Client tools the agent declares for the phone app; the browser cannot run them.
const PHONE_ONLY_TOOLS = [
  "find_contact",
  "call_phone",
  "media_control",
  "send_whatsapp",
];
const PHONE_ONLY_ANSWER =
  "הכלי הזה זמין רק באפליקציה בטלפון. בבקשות כאלה העבירי ל-ask_carmen, או אמרי למשתמש שאפשר לעשות את זה מהאפליקציה.";

const BACKGROUND_ACK =
  "הבדיקה התחילה ברקע. אמרי במשפט קצר שאת בודקת ושאפשר להמשיך לדבר בינתיים. אל תמסרי נתונים עד שתגיע הודעה שמתחילה ב-[תשובה מ-ask_carmen].";

/** Opens an ElevenLabs conversation with the same callbacks as the OpenAI Realtime client. */
export async function startElevenLabsVoice(
  session: ElevenLabsSession,
  cb: RealtimeCallbacks,
): Promise<RealtimeHandle> {
  let stopped = false;
  let raf = 0;
  let muted = false;
  const conversation = await Conversation.startSession({
    signedUrl: session.signed_url,
    connectionType: "websocket",
    overrides: {
      agent: {
        prompt: { prompt: session.prompt },
        firstMessage: session.first_message,
        language: "he",
      },
      tts: { voiceId: session.voice_id },
    },
    clientTools: {
      // Answers at once and asks the brain in the background, so Carmen keeps listening; the
      // answer reaches her as a message when ready (as in the Android app).
      ask_carmen: (params: { question?: unknown }) => {
        const question = text(params?.question);
        void cb.onToolCall(question).then((answer) => {
          if (!stopped) {
            conversation.sendUserMessage(
              `[תשובה מ-ask_carmen לשאלה "${question.slice(0, 160)}"]\n${answer.slice(0, 8000)}\nמסרי למשתמש עכשיו את השורה התחתונה בקצרה.`,
            );
          }
        });
        return BACKGROUND_ACK;
      },
      save_pronunciation: (params: { term?: unknown; spoken?: unknown }) =>
        cb.onSavePronunciation(text(params?.term), text(params?.spoken)),
      ...Object.fromEntries(
        PHONE_ONLY_TOOLS.map((name) => [name, () => PHONE_ONLY_ANSWER]),
      ),
    },
    onMessage: ({ message, role }) => {
      const clean = message.trim();
      if (!clean) {
        return;
      }
      if (role === "user") {
        cb.onUserTranscript(clean);
      } else {
        cb.onAssistantDone(clean);
      }
    },
    onModeChange: ({ mode }) => cb.onStateChange(mode),
    onError: (message) => cb.onError(`ElevenLabs: ${message}`),
    onDisconnect: () => {
      if (!stopped) {
        cb.onError("ElevenLabs: השיחה נותקה");
      }
    },
  });
  // Carmen's output level drives the face, as the OpenAI client's analyser does.
  const tick = () => {
    if (stopped) {
      return;
    }
    cb.audioLevelRef.current = Math.min(1, conversation.getOutputVolume() * 2);
    raf = requestAnimationFrame(tick);
  };
  tick();
  return {
    setMicMuted: (isMuted) => conversation.setMicMuted(isMuted),
    setOutputMuted: (isMuted) => {
      muted = isMuted;
      conversation.setVolume({ volume: muted ? 0 : 1 });
    },
    speakText: (message) => {
      const clean = message.trim().slice(0, 4000);
      if (!stopped && clean) {
        conversation.sendUserMessage(
          `(הודעה מהמערכת, לא מהמשתמש) אמרי למשתמש בדיוק את זה, בלי תוספות: ${clean}`,
        );
      }
    },
    stop: () => {
      stopped = true;
      cancelAnimationFrame(raf);
      cb.audioLevelRef.current = 0;
      conversation.endSession().catch(() => {});
    },
  };
}

/** A string tool argument, or empty. */
function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
