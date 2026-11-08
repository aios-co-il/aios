/** A voice run's rows and engines for the nikud tests (voice-nikud.test.ts). */
import { vi } from "vitest";
import { vocalizeForSpeech } from "../src/jobs/vocalize.ts";
import type { RunOutput } from "../src/jobs/types.ts";
import { fakeFetch, jsonBodyOf, runOf } from "./fakes.ts";

// Dicta's answer for these words: it writes בוקר without its mater (בֹּקֶר).
export const PLAIN = "הקפה שלנו נקלה בכל בוקר.";
export const POINTED = "הַקָּפֶה שֶׁלָּנוּ נְקַלָּה בְּכָל בֹּקֶר.";

/**
 * A voice run over one scene row whose text is PLAIN; records what the run stores. With
 * `restUpdate`, the update only reaches the database (as the REST client does), not the run.
 */
export function voiceFixture(
  input: Record<string, unknown>,
  sceneMeta = {},
  { restUpdate = false } = {},
) {
  const run = runOf({
    id: "run1",
    tenant_id: "t1",
    item_id: "item1",
    scene_id: input.continuous ? null : "s1",
    input,
    output: {},
  });
  const rpcs: Array<[string, VoiceMeta]> = [];
  const updates: Array<{ output: RunOutput }> = [];
  const db = {
    async select(table: string) {
      if (table === "marketing_work_items") {
        return [{ id: "item1", tenant_id: "t1", client_id: "c1" }];
      }
      return [{ id: "s1", voiceover_text: PLAIN, meta: sceneMeta }];
    },
    async upload() {},
    async update(
      _table: string,
      _filter: string,
      patch: { output: RunOutput },
    ) {
      updates.push(patch);
      if (!restUpdate) {
        run.output = patch.output;
      }
    },
    async rpc(name: string, args: { p_meta: VoiceMeta }) {
      rpcs.push([name, args.p_meta]);
    },
  };
  return { run, db, rpcs, updates };
}

export const pointedVocalize = (text: string) =>
  vocalizeForSpeech(text, { vocalizer: async () => POINTED });

/** ElevenLabs answers with timings for exactly what it was sent, and optionally a billed count. */
export function stubElevenLabs(sent: Array<string>, characterCost?: string) {
  vi.stubGlobal(
    "fetch",
    fakeFetch(async (_url, init) => {
      const { text } = jsonBodyOf<{ text: string }>(init);
      sent.push(text);
      const characters = text.split("");
      return Response.json(
        {
          audio_base64: "AQID",
          alignment: {
            characters,
            character_start_times_seconds: characters.map((_, at) => at / 10),
            character_end_times_seconds: characters.map(
              (_, at) => (at + 1) / 10,
            ),
          },
        },
        { headers: characterCost ? { "character-cost": characterCost } : {} },
      );
    }),
  );
}

/** The narration meta a voice run attaches (attach_video_narration, attach_video_scene_asset). */
interface VoiceMeta {
  text?: string;
  alignment?: { characters: Array<string> } | null;
  [key: string]: unknown;
}

/** What a speech engine is sent: OpenRouter's `input`, Gemini's `contents`. */
export interface SpeechRequest {
  input?: string;
  contents?: Array<{ parts: Array<{ text: string }> }>;
}
