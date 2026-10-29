import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { parseCallbackBody } from "./callback-body.ts";

Deno.test("parseCallbackBody reads a full callback body", () => {
  const body = parseCallbackBody({
    conversation_id: " conv ",
    session_id: "sess",
    content: " hi ",
    tenant_id: "t1",
    origin: "cursor",
    event_type: "progress",
    speaker: "bot",
    idempotency_key: "k1",
    external_message_id: 42,
    parliament_round: 2,
    metadata: { step: 1 },
  });
  assertEquals(body, {
    conversation_id: "conv",
    session_id: "sess",
    content: "hi",
    tenant_id: "t1",
    origin: "cursor",
    event_type: "progress",
    speaker: "bot",
    idempotency_key: "k1",
    external_message_id: "42",
    parliament_round: 2,
    metadata: { step: 1 },
  });
});

Deno.test("parseCallbackBody defaults missing and odd fields", () => {
  const body = parseCallbackBody({
    content: 5,
    origin: 7,
    event_type: "custom",
    parliament_round: "2",
    metadata: "x",
  });
  assertStrictEquals(body.conversation_id, "");
  assertStrictEquals(body.content, "5");
  assertStrictEquals(body.origin, null);
  assertStrictEquals(body.event_type, "custom");
  assertStrictEquals(body.speaker, undefined);
  assertStrictEquals(body.parliament_round, undefined);
  assertEquals(body.metadata, {});
});

Deno.test("parseCallbackBody treats non-object bodies as empty", () => {
  for (const raw of [null, "text", 3, [1]]) {
    const body = parseCallbackBody(raw);
    assertStrictEquals(body.conversation_id, "");
    assertStrictEquals(body.event_type, "message");
    assertEquals(body.metadata, {});
  }
});
