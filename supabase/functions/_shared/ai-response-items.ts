import { z } from "npm:zod@3.25.76";

export interface EmbeddingItem {
  index?: number;
  embedding: number[];
}

export interface WhisperSegment {
  no_speech_prob?: number;
  text?: string;
  start?: number;
  end?: number;
}

export interface ScribeWord {
  type?: string;
  text?: string;
  speaker_id?: string;
  start?: number;
  end?: number;
}

const numberAt = z.number().optional().catch(undefined);

/** Any present value as text; null and absent read as undefined. */
const textAt = z
  .unknown()
  .transform((value) => (value == null ? undefined : String(value)));

const items = z.array(z.unknown()).catch([]);

/** Every list entry is kept; one that is not an object reads as all-undefined. */
const lenient = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).catch(() => z.object(shape).parse({}));

const embeddingItemSchema = z.object({
  index: numberAt,
  embedding: z.array(z.number()),
});

const whisperSegmentSchema = lenient({
  no_speech_prob: numberAt,
  text: textAt,
  start: numberAt,
  end: numberAt,
});

const scribeWordSchema = lenient({
  type: textAt,
  text: textAt,
  speaker_id: textAt,
  start: numberAt,
  end: numberAt,
});

/** OpenAI embeddings `data`; items without a numeric embedding are dropped. */
export function readEmbeddingItems(value: unknown): EmbeddingItem[] {
  return items.parse(value).flatMap((item) => {
    const parsed = embeddingItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Whisper verbose_json `segments`. */
export function readWhisperSegments(value: unknown): WhisperSegment[] {
  return items.parse(value).map((s) => whisperSegmentSchema.parse(s));
}

/** ElevenLabs Scribe `words`. */
export function readScribeWords(value: unknown): ScribeWord[] {
  return items.parse(value).map((w) => scribeWordSchema.parse(w));
}
