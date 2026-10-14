// Model calls for reference analysis: transcript, shot descriptions, storyboard proposal.

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const VISION_MODEL = process.env.REFERENCE_VISION_MODEL || "gpt-4o-mini";
const PLAN_MODEL = process.env.REFERENCE_PLAN_MODEL || "gpt-4o-mini";
// gpt-4o-mini list price, USD per 1M tokens.
const PRICE = { in: 0.15, out: 0.6 };

export const costOfUsage = (usage) =>
  usage
    ? +(
        ((usage.prompt_tokens ?? 0) * PRICE.in +
          (usage.completion_tokens ?? 0) * PRICE.out) /
        1e6
      ).toFixed(6)
    : 0;

/** Word-level transcript. ElevenLabs Scribe when a key exists, otherwise Whisper. */
export async function transcribe(audioBytes, { elevenLabsKey, openaiKey }) {
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
      const data = await response.json();
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
  const data = await response.json();
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

async function chatJson(openaiKey, model, messages) {
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
  const data = await response.json();
  return {
    value: JSON.parse(data.choices?.[0]?.message?.content ?? "{}"),
    usage: data.usage ?? null,
  };
}

/** One vision call over all keyframes: what each shot shows and how it moves. */
export async function describeShots(openaiKey, shots, keyframes) {
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
  const { value, usage } = await chatJson(openaiKey, VISION_MODEL, [
    { role: "user", content },
  ]);
  const described = Array.isArray(value.shots) ? value.shots : [];
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
export async function proposeStoryboard(openaiKey, { shots, brief }) {
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
  const { value, usage } = await chatJson(openaiKey, PLAN_MODEL, [
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
export function normalizeFrames(frames, shots) {
  const list = Array.isArray(frames) ? frames : [];
  return shots.map((shot, index) => {
    const frame = list[index] ?? {};
    const clean = (value) =>
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
