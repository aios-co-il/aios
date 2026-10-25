import assert from "node:assert/strict";
import { test } from "node:test";
import {
  capabilityReport,
  connectedProviders,
  imageProvidersFor,
} from "./capabilities.ts";

test("only providers with a filled key count as connected", () => {
  const connected = connectedProviders({
    openai_api_key: "  ",
    google_api_key: "g",
    elevenlabs_api_key: "e",
    higgsfield_api_key_id: "id",
  });
  assert.deepEqual(connected, {
    openai: false,
    google: true,
    anthropic: false,
    elevenlabs: true,
    higgsfield: false,
  });
  assert.equal(connectedProviders({}, { openai: "sk" }).openai, true);
  assert.equal(
    connectedProviders({ higgsfield_api_key_secret: "id:secret" }).higgsfield,
    true,
  );
});

test("images work with any one of OpenAI, Google or ElevenLabs, tried in that order", () => {
  assert.deepEqual(
    imageProvidersFor(
      connectedProviders({ elevenlabs_api_key: "e", google_api_key: "g" }),
    ),
    ["google", "elevenlabs"],
  );
  assert.deepEqual(imageProvidersFor(connectedProviders({})), []);
});

test("the report says what can be made and what is missing, without key values", () => {
  const report = capabilityReport({
    elevenlabs_api_key: "secret-e",
    openai_api_key: "secret-o",
  });
  assert.equal(report.can.images, true);
  assert.equal(report.can.video, true);
  assert.equal(report.can.narration, true);
  assert.deepEqual(report.missing, []);
  assert.equal(JSON.stringify(report).includes("secret"), false);

  const bare = capabilityReport({});
  assert.equal(bare.can.images, false);
  assert.equal(bare.can.video, false);
  assert.ok(bare.missing.length >= 3);
});

test("a Google key is enough for Gemini narration", () => {
  const report = capabilityReport({ google_api_key: "g" });
  assert.equal(report.can.narration, true);
  assert.equal(report.can.music, false);
});

test("only an ElevenLabs key is enough for pictures, film and sound", () => {
  const report = capabilityReport({ elevenlabs_api_key: "e" });
  assert.deepEqual(report.can.image_providers, ["ElevenLabs"]);
  assert.equal(report.can.video, true);
  assert.equal(report.brains.length, 0);
});
