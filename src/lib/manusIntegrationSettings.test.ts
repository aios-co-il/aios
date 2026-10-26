import { expect, test } from "vitest";
import {
  integrationSettingsObject,
  manusOutputText,
  readManusWaSettings,
} from "./manusIntegrationSettings.ts";

test("integrationSettingsObject returns objects as-is", () => {
  const settings = { webhook_id: "w1", api_key: "k" };
  expect(integrationSettingsObject(settings)).toBe(settings);
});

test("integrationSettingsObject returns {} for null, arrays and scalars", () => {
  expect(integrationSettingsObject(null)).toStrictEqual({});
  expect(integrationSettingsObject(undefined)).toStrictEqual({});
  expect(integrationSettingsObject([1, 2])).toStrictEqual({});
  expect(integrationSettingsObject("x")).toStrictEqual({});
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
  expect(s.instance_id).toBe("inst");
  expect(s.webhook_secret).toBe("sec");
  expect(s.country_code).toBe("972");
  expect(s.status).toBe("CONNECTED");
  expect(s.phone_number).toBe("+972500000000");
});

test("readManusWaSettings treats non-string values and missing settings as absent", () => {
  const s = readManusWaSettings({ instance_id: 5, status: null });
  expect(s.instance_id).toBe(undefined);
  expect(s.status).toBe(undefined);
  expect(readManusWaSettings(null).webhook_secret).toBe(undefined);
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
  expect(manusOutputText(output)).toBe("a\n\nb");
});

test("manusOutputText returns null for non-arrays and outputs without text", () => {
  expect(manusOutputText(null)).toBe(null);
  expect(manusOutputText({ content: [] })).toBe(null);
  expect(
    manusOutputText([
      null,
      { content: "no" },
      { content: [{ type: "output_text", text: 3 }] },
    ]),
  ).toBe(null);
});
