import { manusPayloadSchema } from "./payload-schema.ts";

for (const value of [null, [], "invalid", 42, true]) {
  Deno.test(`rejects non-object envelope ${JSON.stringify(value)}`, () => {
    if (manusPayloadSchema.safeParse(value).success)
      throw new Error("Invalid envelope accepted");
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
    media: { url: "https://example.test/audio", mimetype: "audio/ogg" },
    hasMedia: true,
  },
  ack: { event: "message_ack", ack: 3, messageId: "message" },
  ping: {},
  group: {
    chatId: "group@g.us",
    participant: "member@lid",
    quotedMsg: { id: "quoted" },
  },
})) {
  Deno.test(`preserves ${name} provider fields`, () => {
    const result = manusPayloadSchema.safeParse(value);
    if (!result.success) throw new Error("Valid object rejected");
    if (JSON.stringify(result.data) !== JSON.stringify(value))
      throw new Error("Provider fields changed");
  });
}
