import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { normalizeManusPayload } from "./payload-normalizer.ts";

Deno.test("Baileys nested message under data", () => {
  const { key, msgContainer, payload } = normalizeManusPayload({
    instanceId: "i1",
    data: {
      key: {
        remoteJid: "120363000000000000@g.us",
        fromMe: false,
        id: "BAE5ABC",
        participant: "972501234567@s.whatsapp.net",
      },
      pushName: "Dana",
      message: { conversation: "hello carmen" },
    },
  });
  assertEquals(key.participant, "972501234567@s.whatsapp.net");
  assertEquals(msgContainer, { conversation: "hello carmen" });
  assertEquals(payload.event, "message");
  assertEquals(payload.from, "120363000000000000@g.us");
  assertEquals(payload.body, "hello carmen");
  assertEquals(payload.fromMe, false);
  assertEquals(payload.id, "BAE5ABC");
  assertEquals(payload.messageId, "BAE5ABC");
  assertEquals(payload.senderName, "Dana");
  assertEquals(payload.author, "972501234567@s.whatsapp.net");
  assertEquals(payload.hasMedia, false);
});

Deno.test("Baileys media message is flagged as media", () => {
  const { payload } = normalizeManusPayload({
    data: {
      key: { remoteJid: "972501234567@s.whatsapp.net", id: "M2" },
      message: { audioMessage: { mimetype: "audio/ogg; codecs=opus" } },
    },
  });
  assertEquals(payload.hasMedia, true);
  assertEquals(payload.body, "");
});

Deno.test("flat chat event becomes a message", () => {
  const { inner, payload } = normalizeManusPayload({
    event: "chat",
    instanceId: "i1",
    from: "972501234567@c.us",
    to: "972509999999@c.us",
    body: "hi",
    fromMe: false,
    id: "true_972501234567@c.us_ABC",
  });
  assertEquals(inner, {});
  assertEquals(payload.event, "message");
  assertEquals(payload.from, "972501234567@c.us");
  assertEquals(payload.to, "972509999999@c.us");
  assertEquals(payload.body, "hi");
  assertEquals(payload.messageId, "true_972501234567@c.us_ABC");
});

Deno.test("{event, data} envelope reads fields from data", () => {
  const { payload } = normalizeManusPayload({
    event: "message",
    data: {
      chatId: "972501234567@c.us",
      text: "from data",
      direction: "outgoing",
      messageId: "D1",
    },
  });
  assertEquals(payload.event, "message");
  assertEquals(payload.from, "972501234567@c.us");
  assertEquals(payload.body, "from data");
  assertEquals(payload.fromMe, true);
  assertEquals(payload.direction, "outgoing");
  assertEquals(payload.id, "D1");
  assertEquals(payload.messageId, "D1");
});

Deno.test("object body is used as the envelope and its text", () => {
  const { inner, payload } = normalizeManusPayload({
    event: "message",
    from: "972501234567@c.us",
    body: { text: "nested text" },
  });
  assertEquals(inner, { text: "nested text" });
  assertEquals(payload.body, "nested text");
});

Deno.test("array body yields an empty text and no envelope", () => {
  const { inner, payload } = normalizeManusPayload({
    event: "message",
    from: "972501234567@c.us",
    body: ["a", "b"],
  });
  assertEquals(inner, {});
  assertEquals(payload.body, "");
  assertEquals(payload.event, "message");
});

Deno.test("non-message events keep their event name", () => {
  assertEquals(normalizeManusPayload({}).payload.event, "ping");
  assertEquals(
    normalizeManusPayload({ type: "ack", ack: 3, id: "A1" }).payload.event,
    "ack",
  );
  assertEquals(
    normalizeManusPayload({ event: "chat", instanceId: "i1" }).payload.event,
    "chat",
  );
});
