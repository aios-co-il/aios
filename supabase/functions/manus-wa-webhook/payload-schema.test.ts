import { assertEquals } from "jsr:@std/assert@1";
import { parseManusBody, providerId } from "./payload-schema.ts";

for (const value of [null, [], "invalid", 42, true]) {
  Deno.test(`rejects non-object JSON ${JSON.stringify(value)}`, () => {
    assertEquals(parseManusBody(value), { status: "not_object" });
  });
}

// Real gateway shapes the handler must keep accepting, passed through unchanged.
for (const [name, payload] of Object.entries({
  flat: {
    event: "message",
    instanceId: "test",
    from: "972500000000",
    body: "hi",
    custom: { future: true },
  },
  wrappedData: {
    data: { key: { id: "1" }, message: { conversation: "hi" } },
  },
  voice: {
    hasMedia: true,
    media: { url: "https://example.test/audio", mimetype: "audio/ogg" },
  },
  ack: { event: "message_ack", ack: 3, messageId: "message" },
  group: { chatId: "group@g.us", participant: "member@lid" },
  numericIdsAndNulls: { instance_id: 7, id: 42, from: null, body: null },
  deepExtensions: {
    data: { message: { data: { providerExtension: { keep: [1, "x"] } } } },
  },
})) {
  Deno.test(`accepts ${name} payload unchanged`, () => {
    assertEquals(parseManusBody(payload), { status: "ok", payload });
  });
}

// Shapes the old handler processed must still parse, with scalars untouched
// and non-object containers dropped like `pickObj` skips them.
Deno.test("keeps loosely typed scalars unchanged", () => {
  const payload = {
    from: "972500000000",
    body: 5,
    senderName: 7,
    fromMe: "1",
    hasMedia: "0",
    id: { _serialized: "true_972500000000@c.us_ABC", id: "ABC" },
    media: false,
    audioMessage: "oops",
  };

  assertEquals(parseManusBody(payload), { status: "ok", payload });
});

for (const [name, payload, expected] of [
  [
    "message string",
    { from: "972500000000", body: "hi", message: "hi" },
    { from: "972500000000", body: "hi" },
  ],
  [
    "data list",
    { from: "972500000000", body: "hi", data: [] },
    { from: "972500000000", body: "hi" },
  ],
  [
    "data string",
    { from: "972500000000", body: "hi", data: "invalid" },
    { from: "972500000000", body: "hi" },
  ],
  ["key list", { from: "972500000000", key: [] }, { from: "972500000000" }],
] as const) {
  Deno.test(`drops ${name} and keeps the rest`, () => {
    // JSON round trip: a dropped container leaves an explicit `undefined` key.
    assertEquals(JSON.parse(JSON.stringify(parseManusBody(payload))), {
      status: "ok",
      payload: expected,
    });
  });
}

Deno.test("providerId reads _serialized from an id object", () => {
  assertEquals(providerId({ _serialized: "a@c.us", id: "a" }), "a@c.us");
  assertEquals(providerId(42), 42);
  assertEquals(providerId(undefined), undefined);
});
