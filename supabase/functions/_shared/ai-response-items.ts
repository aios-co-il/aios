import { unknownField } from "./json-fields.ts";

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

function numberAt(value: unknown, key: string): number | undefined {
  const field = unknownField(value, key);
  return typeof field === "number" ? field : undefined;
}

function textAt(value: unknown, key: string): string | undefined {
  const field = unknownField(value, key);
  return field == null ? undefined : String(field);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => typeof n === "number");
}

/** OpenAI embeddings `data`; items without a numeric embedding are dropped. */
export function readEmbeddingItems(value: unknown): EmbeddingItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const embedding = unknownField(item, "embedding");
    return isNumberArray(embedding)
      ? [{ index: numberAt(item, "index"), embedding }]
      : [];
  });
}

/** Whisper verbose_json `segments`. */
export function readWhisperSegments(value: unknown): WhisperSegment[] {
  if (!Array.isArray(value)) return [];
  return value.map((s) => ({
    no_speech_prob: numberAt(s, "no_speech_prob"),
    text: textAt(s, "text"),
    start: numberAt(s, "start"),
    end: numberAt(s, "end"),
  }));
}

/** ElevenLabs Scribe `words`. */
export function readScribeWords(value: unknown): ScribeWord[] {
  if (!Array.isArray(value)) return [];
  return value.map((w) => ({
    type: textAt(w, "type"),
    text: textAt(w, "text"),
    speaker_id: textAt(w, "speaker_id"),
    start: numberAt(w, "start"),
    end: numberAt(w, "end"),
  }));
}
