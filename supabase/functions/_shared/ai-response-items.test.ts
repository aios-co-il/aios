import assert from "node:assert/strict";
import test from "node:test";
import {
  readEmbeddingItems,
  readScribeWords,
  readWhisperSegments,
} from "./ai-response-items.ts";

test("readEmbeddingItems keeps numeric embeddings and drops malformed items", () => {
  assert.deepEqual(
    readEmbeddingItems([
      { index: 1, embedding: [0.5] },
      { embedding: [1] },
      { index: 2, embedding: "x" },
      null,
    ]),
    [
      { index: 1, embedding: [0.5] },
      { index: undefined, embedding: [1] },
    ],
  );
  assert.deepEqual(readEmbeddingItems({ data: [] }), []);
});

test("readWhisperSegments reads segment fields and ignores wrong types", () => {
  assert.deepEqual(
    readWhisperSegments([
      { no_speech_prob: 0.1, text: " hi", start: 0, end: 1.5 },
      { start: "x" },
    ]),
    [
      { no_speech_prob: 0.1, text: " hi", start: 0, end: 1.5 },
      {
        no_speech_prob: undefined,
        text: undefined,
        start: undefined,
        end: undefined,
      },
    ],
  );
  assert.deepEqual(readWhisperSegments(undefined), []);
});

test("readScribeWords reads word fields", () => {
  assert.deepEqual(
    readScribeWords([
      { type: "word", text: "a", speaker_id: "speaker_1", start: 1, end: 2 },
    ]),
    [{ type: "word", text: "a", speaker_id: "speaker_1", start: 1, end: 2 }],
  );
  assert.deepEqual(readScribeWords("x"), []);
});
