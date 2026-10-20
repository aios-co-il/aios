import assert from "node:assert/strict";
import { manusPayloadSchema } from "./payload-schema.ts";

for (const value of [null, [], "invalid", 42, true]) {
  Deno.test(`rejects non-object envelope ${JSON.stringify(value)}`, () => {
    assert.equal(manusPayloadSchema.safeParse(value).success, false);
  });
}

for (const [name, value] of Object.entries({
  flat: {
    instanceId: "test",
    from: "972500000000",
    body: "hi",
    custom: { future: true },
  },
  wrappedData: { event: "message", data: { body: "hi" } },
  wrappedMessage: { message: { message: { conversation: "hi" } } },
  wrappedPayload: {
    payload: { audioMessage: { url: "https://example.test/audio" } },
  },
  wrappedBody: { body: { key: { participant: "972500000000@c.us" } } },
  voice: {
    media: {
      url: "https://example.test/audio",
      mimetype: "audio/ogg",
      providerToken: "opaque",
    },
    hasMedia: true,
  },
  ack: { event: "message_ack", ack: 3, messageId: "message" },
  ping: {},
  group: {
    chatId: "group@g.us",
    participant: "member@lid",
    quotedMsg: { id: "quoted" },
  },
  numericIds: { instance_id: 7, id: 42, from: 972500000000 },
  flags: { fromMe: "false", hasMedia: 1, key: { fromMe: true } },
  nullable: {
    from: null,
    messageId: null,
    media: null,
    data: null,
    body: null,
  },
  futureEvent: {
    event: "provider_new_event",
    direction: "provider_new_direction",
    providerField: [1, { keep: true }],
  },
  nestedExtensions: {
    data: {
      message: {
        key: { remoteJid: "group@g.us", future: 1 },
        audioMessage: { url: "opaque-media-reference", future: { keep: true } },
        future: true,
      },
    },
  },
  textObject: { text: { body: "hi" } },
})) {
  Deno.test(`preserves ${name} provider fields`, () => {
    const result = manusPayloadSchema.safeParse(value);
    assert.equal(result.success, true);
    if (result.success) assert.deepEqual(result.data, value);
  });
}

for (const [name, value] of Object.entries({
  event: { event: {} },
  identifier: { from: [] },
  sender: { senderName: 42 },
  ack: { ack: {} },
  flag: { fromMe: "yes" },
  mediaFlag: { hasMedia: [] },
  key: { key: [] },
  keyIdentifier: { key: { remoteJid: {} } },
  wrapper: { data: "invalid" },
  nestedWrapper: { data: { message: [] } },
  wrappedMessageId: { payload: { messageId: false } },
  body: { body: [] },
  media: { audioMessage: [] },
  mediaUrl: { audioMessage: { url: 42 } },
  mediaMime: { media: { mimetype: false } },
  quotedMessage: { quotedMsg: { id: {} } },
  context: { contextInfo: { stanzaId: [] } },
})) {
  Deno.test(`rejects malformed known ${name} field`, () => {
    assert.equal(manusPayloadSchema.safeParse(value).success, false);
  });
}

Deno.test(
  "validates each consumed container layer without recursive schemas",
  () => {
    for (const outer of ["data", "message", "payload", "body"]) {
      const valid = {
        [outer]: {
          message: { from: "member@lid", audioMessage: { url: "opaque" } },
        },
      };
      assert.deepEqual(manusPayloadSchema.parse(valid), valid);
      assert.equal(
        manusPayloadSchema.safeParse({ [outer]: { message: { from: [] } } })
          .success,
        false,
      );
    }
  },
);

Deno.test(
  "preserves deeper extensions beyond the layers the handler consumes",
  () => {
    const payload = {
      data: {
        message: {
          data: { providerExtension: { from: ["opaque", "extension"] } },
        },
      },
    };
    assert.deepEqual(manusPayloadSchema.parse(payload), payload);
  },
);
