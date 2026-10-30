import { assertEquals } from "jsr:@std/assert@1";
import {
  readEmbeddingItems,
  readScribeWords,
  readWhisperSegments,
} from "./ai-response-items.ts";

Deno.test(
  "readEmbeddingItems keeps numeric embeddings and drops malformed items",
  () => {
    assertEquals(
      readEmbeddingItems([
        { index: 1, embedding: [0.5] },
        { embedding: [1] },
        { index: 2, embedding: "x" },
        null,
      ]),
      [{ index: 1, embedding: [0.5] }, { embedding: [1] }],
    );
    assertEquals(readEmbeddingItems({ data: [] }), []);
  },
);

Deno.test(
  "readWhisperSegments reads segment fields and ignores wrong types",
  () => {
    assertEquals(
      readWhisperSegments([
        { no_speech_prob: 0.1, text: " hi", start: 0, end: 1.5 },
        { start: "x" },
      ]),
      [
        { no_speech_prob: 0.1, text: " hi", start: 0, end: 1.5 },
        { start: undefined },
      ],
    );
    assertEquals(readWhisperSegments(undefined), []);
  },
);

Deno.test("readScribeWords reads word fields", () => {
  assertEquals(
    readScribeWords([
      { type: "word", text: "a", speaker_id: "speaker_1", start: 1, end: 2 },
    ]),
    [{ type: "word", text: "a", speaker_id: "speaker_1", start: 1, end: 2 }],
  );
  assertEquals(readScribeWords("x"), []);
});

Deno.test("readScribeWords keeps a non-object word as an empty one", () => {
  assertEquals(readScribeWords([null, { start: "1", text: 5 }]), [
    {},
    { start: undefined, text: "5" },
  ]);
});
