import { describe, expect, it, test } from "vitest";
import {
  mergeManusSettings,
  manusOutputText,
  readManusWaSettings,
} from "./manusIntegrationSettings.ts";

describe("Manus domain parsing", () => {
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
    expect(readManusWaSettings([1]).instance_id).toBe(undefined);
    expect(readManusWaSettings("x")).toStrictEqual({});
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
        { content: [{ type: "output_text", text: "" }] },
        { content: [{ type: "output_text" }, "text"] },
      ]),
    ).toBe(null);
  });

  test("manusOutputText rejects non-string output_text values", () => {
    expect(
      manusOutputText([{ content: [{ type: "output_text", text: 3 }] }]),
    ).toBe(null);
  });

  test("rejects malformed credentials without discarding valid settings", () => {
    expect(readManusWaSettings({ api_key: {}, webhook_id: "w" })).toMatchObject(
      { api_key: undefined, webhook_id: "w" },
    );
  });
  test("preserves opaque stored extensions when patching settings", () => {
    expect(
      mergeManusSettings({ extension: { enabled: true } }, { webhook_id: "w" }),
    ).toEqual({ extension: { enabled: true }, webhook_id: "w" });
  });
});

describe("settings update preservation", () => {
  it("keeps extensions and existing fields when a parsed patch omits them", () => {
    expect(
      mergeManusSettings(
        { extension: { enabled: true }, status: "connected", api_key: "old" },
        { api_key: "new", status: undefined },
      ),
    ).toEqual({
      extension: { enabled: true },
      status: "connected",
      api_key: "new",
    });
  });
});
