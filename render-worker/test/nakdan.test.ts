import { afterEach, describe, expect, test, vi } from "vitest";
import { nakdanBody, nakdanVocalizer } from "../src/providers/nakdan.ts";

afterEach(() => vi.unstubAllEnvs());

describe("Dicta Nakdan", () => {
  test("joins each word's best reading, keeps separators and drops Dicta's prefix marks", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([
        { word: "הקפה", sep: false, options: ["הַקָּפֶה", "הַקֹּפֶה"] },
        { word: " ", sep: true, options: [] },
        { word: "שלנו", sep: false, options: ["שֶׁ|לָּנוּ"] },
        { word: ", ", sep: true },
        { word: "1000", sep: true, options: [] },
        { word: " ", sep: true, options: [] },
        { word: "AIOS", sep: false, options: [] },
      ]),
    );
    const vocalizer = nakdanVocalizer(fetchImpl);
    expect(await vocalizer("הקפה שלנו, 1000 AIOS")).toBe(
      "הַקָּפֶה שֶׁלָּנוּ, 1000 AIOS",
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1].body))).toStrictEqual(
      nakdanBody("הקפה שלנו, 1000 AIOS"),
    );
  });

  test("an error status throws, so the script is spoken as written", async () => {
    const vocalizer = nakdanVocalizer(
      async () => new Response("", { status: 502 }),
    );
    await expect(vocalizer("שלום")).rejects.toThrow("nakdan 502");
  });

  test("a 200 with no words or not a list throws", async () => {
    await expect(
      nakdanVocalizer(async () => Response.json([]))("שלום"),
    ).rejects.toThrow("nakdan returned no words");
    await expect(
      nakdanVocalizer(async () => Response.json({ error: "busy" }))("שלום"),
    ).rejects.toThrow("nakdan returned no words");
  });

  test("a vocalizer slower than NIKUD_TIMEOUT_MS is aborted", async () => {
    vi.stubEnv("NIKUD_TIMEOUT_MS", "20");
    const hanging = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      });
    await expect(nakdanVocalizer(hanging)("שלום")).rejects.toThrow(
      /timeout|abort/i,
    );
  });
});
