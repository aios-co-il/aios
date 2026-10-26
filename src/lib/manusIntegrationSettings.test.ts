import assert from "node:assert/strict";
import test from "node:test";
import {
  integrationSettingsObject,
  manusOutputText,
  readManusWaSettings,
} from "./manusIntegrationSettings.ts";

test("integrationSettingsObject returns objects as-is", () => {
  const settings = { webhook_id: "w1", api_key: "k" };
  assert.equal(integrationSettingsObject(settings), settings);
});

test("integrationSettingsObject returns {} for null, arrays and scalars", () => {
  assert.deepEqual(integrationSettingsObject(null), {});
  assert.deepEqual(integrationSettingsObject(undefined), {});
  assert.deepEqual(integrationSettingsObject([1, 2]), {});
  assert.deepEqual(integrationSettingsObject("x"), {});
});

test("readManusWaSettings reads string fields", () => {
  const s = readManusWaSettings({
    instance_id: "inst",
    webhook_secret: "sec",
    country_code: "972",
    status: "CONNECTED",
    phone_number: "+972500000000",
    extra: 1,
  });
  assert.equal(s.instance_id, "inst");
  assert.equal(s.webhook_secret, "sec");
  assert.equal(s.country_code, "972");
  assert.equal(s.status, "CONNECTED");
  assert.equal(s.phone_number, "+972500000000");
});

test("readManusWaSettings treats non-string values and missing settings as absent", () => {
  const s = readManusWaSettings({ instance_id: 5, status: null });
  assert.equal(s.instance_id, undefined);
  assert.equal(s.status, undefined);
  assert.equal(readManusWaSettings(null).webhook_secret, undefined);
});

test("manusOutputText joins output_text parts across items", () => {
  const output = [
    {
      content: [
        { type: "output_text", text: "a" },
        { type: "image", text: "x" },
      ],
    },
    { content: [{ type: "output_text", text: "b" }] },
  ];
  assert.equal(manusOutputText(output), "a\n\nb");
});

test("manusOutputText returns null for non-arrays and outputs without text", () => {
  assert.equal(manusOutputText(null), null);
  assert.equal(manusOutputText({ content: [] }), null);
  assert.equal(
    manusOutputText([
      null,
      { content: "no" },
      { content: [{ type: "output_text", text: 3 }] },
    ]),
    null,
  );
});
