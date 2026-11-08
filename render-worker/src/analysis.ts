// Model calls for reference analysis: transcript, shot descriptions, storyboard proposal.
import { responseJson } from "./providers/json.ts";
import type { Shot } from "./shots.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const VISION_MODEL = process.env.REFERENCE_VISION_MODEL || "gpt-4o-mini";
const PLAN_MODEL = process.env.REFERENCE_PLAN_MODEL || "gpt-4o-mini";
// gpt-4o-mini list price, USD per 1M tokens.
const PRICE = { in: 0.15, out: 0.6 };

export const costOfUsage = (usage: ChatUsage | null | undefined) =>
  usage
    ? +(
        ((usage.prompt_tokens ?? 0) * PRICE.in +
          (usage.completion_tokens ?? 0) * PRICE.out) /
        1e6
      ).toFixed(6)
    : 0;

/** Word-level transcript. ElevenLabs Scribe when a key exists, otherwise Whisper. */
export async function transcribe(
  audioBytes: Uint8Array,
  {
    elevenLabsKey,
    openaiKey,
  }: { elevenLabsKey?: string | null; openaiKey?: string | null },
): Promise<Transcript> {
  if (elevenLabsKey) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([audioBytes], { type: "audio/mpeg" }),
      "audio.mp3",
    );
    form.append("model_id", process.env.SCRIBE_MODEL || "scribe_v2");
    form.append("timestamps_granularity", "word");
    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: { "xi-api-key": elevenLabsKey },
        body: form,
      },
    );
    if (response.ok) {
      const data = await responseJson<ScribeResponse>(response);
      return {
        provider: "elevenlabs_scribe",
        language: data.language_code ?? null,
        text: data.text ?? "",
        words: (data.words ?? []).map((word) => ({
          text: word.text,
          start: word.start,
          end: word.end,
          type: word.type,
        })),
      };
    }
    console.warn(
      "[reference] scribe failed, falling back to whisper",
      response.status,
    );
  }
  if (!openaiKey)
    return { provider: null, language: null, text: "", words: [] };
  const form = new FormData();
  form.append(
    "file",
    new Blob([audioBytes], { type: "audio/mpeg" }),
    "audio.mp3",
  );
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    },
  );
  if (!response.ok)
    throw new Error(
      `whisper ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  const data = await responseJson<WhisperResponse>(response);
  return {
    provider: "openai_whisper",
    language: data.language ?? null,
    text: data.text ?? "",
    words: (data.words ?? []).map((word) => ({
      text: word.word,
      start: word.start,
      end: word.end,
      type: "word",
    })),
  };
}

/** One JSON-mode chat call; `Answer` names the keys the prompt asks for (not checked). */
async function chatJson<Answer>(
  openaiKey: string,
  model: string,
  messages: Array<{ role: string; content: unknown }>,
) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.4,
    }),
  });
  if (!response.ok)
    throw new Error(
      `${model} ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  const data = await responseJson<ChatResponse>(response);
  const value: Answer = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  return { value, usage: data.usage ?? null };
}

/** One vision call over all keyframes: what each shot shows and how it moves. */
export async function describeShots(
  openaiKey: string,
  shots: Array<Shot>,
  keyframes: Array<Uint8Array>,
) {
  const content = [
    {
      type: "text",
      text: [
        `These are ${shots.length} keyframes, one per shot of a reference ad, in order.`,
        "For each shot return: index, shot_type (Close-up, Medium shot, Wide shot, POV, Product shot, UGC handheld, Cinematic tracking), description (what is seen, 1 sentence), motion (camera and subject movement, short), on_screen_text (verbatim, or empty).",
        'Return JSON: {"shots":[{"index":1,"shot_type":"","description":"","motion":"","on_screen_text":""}]}',
      ].join("\n"),
    },
    ...keyframes
      .map((bytes, index) => [
        { type: "text", text: `Shot ${index + 1} (${shots[index].duration}s)` },
        {
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`,
            detail: "low",
          },
        },
      ])
      .flat(),
  ];
  const { value, usage } = await chatJson<{ shots?: unknown }>(
    openaiKey,
    VISION_MODEL,
    [{ role: "user", content }],
  );
  const described: Array<DescribedShot> = Array.isArray(value.shots)
    ? value.shots
    : [];
  return {
    shots: shots.map((shot, index) => ({
      ...shot,
      ...(described.find((row) => Number(row.index) === shot.index) ??
        described[index] ??
        {}),
      index: shot.index,
    })),
    usage,
  };
}

/**
 * New storyboard that keeps the reference's pace, shot count, durations and camera
 * language, with original content for this client. Never copies characters, brands,
 * logos or dialogue from the reference.
 */
export async function proposeStoryboard(
  openaiKey: string,
  { shots, brief }: { shots: Array<ReferenceShot>; brief: string },
) {
  const system = [
    "You are Carmen, a creative director. You turn a reference ad's STRUCTURE into an ORIGINAL storyboard for a different client.",
    "Keep: number of shots, each shot's duration, rhythm, shot types and camera movement.",
    "Never copy: characters, people's likeness, brand names, logos, products, slogans, on-screen text or dialogue from the reference. Never name animation studios (Pixar, Disney, DreamWorks…) or protected characters; describe the look instead.",
    "visualPrompt is an English image prompt for a still: what is in frame, framing, light. It must not ask for any text, letters or logos.",
    "motionPrompt is English: what moves in the shot (camera and subject).",
    "overlayText and voiceover are in Hebrew, written for the client's offer.",
  ].join("\n");
  const user = [
    `Client and brief:\n${brief || "(no brief — infer a sensible commercial for the client)"}`,
    "Reference shots (structure only):",
    ...shots.map(
      (shot) =>
        `#${shot.index} ${shot.duration}s · ${shot.shot_type ?? ""} · seen: ${shot.description ?? ""} · motion: ${shot.motion ?? ""}${shot.transcript ? ` · spoken length: ${shot.transcript.split(/\s+/).length} words` : ""}`,
    ),
    'Return JSON: {"concept":{"name":"","bigIdea":""},"frames":[{"title":"","shot":"","visualPrompt":"","motionPrompt":"","overlayText":"","voiceover":"","duration":3}]} with exactly one frame per reference shot, in order, each duration equal to that shot.',
  ].join("\n");
  const { value, usage } = await chatJson<{
    concept?: unknown;
    frames?: unknown;
  }>(openaiKey, PLAN_MODEL, [
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  return {
    concept: value.concept ?? {},
    frames: normalizeFrames(value.frames, shots),
    usage,
  };
}

const STUDIOS = /\b(pixar|disney|dreamworks|illumination|ghibli)\b/gi;

/** Clamp the model's frames to the reference shots: same count, same durations, no studio names. */
export function normalizeFrames(frames: unknown, shots: Array<ReferenceShot>) {
  const list: Array<ProposedFrame | null | undefined> = Array.isArray(frames)
    ? frames
    : [];
  return shots.map((shot, index) => {
    const frame = list[index] ?? {};
    const clean = (value: unknown) =>
      String(value ?? "")
        .replace(STUDIOS, "animated feature")
        .trim();
    return {
      title: clean(frame.title) || `סצנה ${index + 1}`,
      shot: clean(frame.shot) || shot.shot_type || "Medium shot",
      visualPrompt: clean(frame.visualPrompt),
      motionPrompt: clean(frame.motionPrompt) || shot.motion || "",
      overlayText: String(frame.overlayText ?? "").trim(),
      voiceover: String(frame.voiceover ?? "").trim(),
      duration: Math.max(0.5, Math.min(30, Number(shot.duration) || 3)),
      referenceShot: shot.index,
    };
  });
}

/** A word-level transcript and the engine that made it (null: no key to transcribe with). */
export interface Transcript {
  provider: string | null;
  language: string | null;
  text: string;
  words: Array<{ text: string; start: number; end: number; type?: string }>;
}

/** What the vision model says about one shot (all model output, so nothing is checked). */
interface DescribedShot {
  index?: unknown;
  shot_type?: string;
  description?: string;
  motion?: string;
  on_screen_text?: string;
}

/** A reference shot with what the model saw in it and the words spoken over it. */
export type ReferenceShot = Shot & DescribedShot & { transcript?: string };

/** A storyboard frame as the planning model returns it. */
interface ProposedFrame {
  title?: unknown;
  shot?: unknown;
  visualPrompt?: unknown;
  motionPrompt?: unknown;
  overlayText?: unknown;
  voiceover?: unknown;
}

/** OpenAI token counts for one call. */
interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

/** POST /v1/chat/completions. */
interface ChatResponse {
  choices: Array<{ message?: { content?: string } }>;
  usage: ChatUsage;
}

/** ElevenLabs Scribe, POST /v1/speech-to-text. */
interface ScribeResponse {
  language_code: string;
  text: string;
  words: Array<{ text: string; start: number; end: number; type: string }>;
}

/** Whisper verbose_json with word timings. */
interface WhisperResponse {
  language: string;
  text: string;
  words: Array<{ word: string; start: number; end: number }>;
}
