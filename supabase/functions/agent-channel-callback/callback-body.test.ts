import { describe, it } from "jsr:@std/testing@1/bdd";
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { parseCallbackBody } from "./callback-body.ts";
describe("callback-body", () => {
  it("parseCallbackBody reads a full callback body", () => {
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

  it("parseCallbackBody defaults missing and odd fields", () => {
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
    assertStrictEquals(body.event_type, null);
    assertStrictEquals(body.speaker, undefined);
    assertStrictEquals(body.parliament_round, undefined);
    assertEquals(body.metadata, {});
  });

  it("parseCallbackBody treats non-object bodies as empty", () => {
    for (const raw of [null, "text", 3, [1]]) {
      const body = parseCallbackBody(raw);
      assertStrictEquals(body.conversation_id, "");
      assertStrictEquals(body.event_type, "message");
      assertEquals(body.metadata, {});
    }
  });

  it("explicit empty event values remain invalid instead of becoming messages", () => {
    for (const event_type of [null, "", 0, false]) {
      assertEquals(parseCallbackBody({ event_type }).event_type, null);
    }
    assertEquals(parseCallbackBody({}).event_type, "message");
  });
});
