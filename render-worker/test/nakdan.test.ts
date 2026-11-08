import { afterEach, describe, expect, test, vi } from "vitest";
import { nakdanBody, nakdanVocalizer } from "../src/providers/nakdan.ts";
import type { FetchImpl } from "../src/providers/types.ts";
import { jsonBodyOf } from "./fakes.ts";

afterEach(() => vi.unstubAllEnvs());

/** The Nakdan vocalizer over `fetchImpl`; it is null only when NIKUD_DICTA_URL is "off". */
function vocalizerOf(fetchImpl: FetchImpl) {
  const vocalizer = nakdanVocalizer(fetchImpl);
  if (!vocalizer) {
    throw new Error("no Nakdan url");
  }
  return vocalizer;
}

describe("Dicta Nakdan", () => {
  test("joins each word's best reading, keeps separators and drops Dicta's prefix marks", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () =>
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
    const vocalizer = vocalizerOf(fetchImpl);
    expect(await vocalizer("הקפה שלנו, 1000 AIOS")).toBe(
      "הַקָּפֶה שֶׁלָּנוּ, 1000 AIOS",
    );
    expect(jsonBodyOf(fetchImpl.mock.calls[0][1])).toStrictEqual(
      nakdanBody("הקפה שלנו, 1000 AIOS"),
    );
  });

  test("an error status throws, so the script is spoken as written", async () => {
    const vocalizer = vocalizerOf(
      async () => new Response("", { status: 502 }),
    );
    await expect(vocalizer("שלום")).rejects.toThrow("nakdan 502");
  });

  test("a 200 with no words or not a list throws", async () => {
    await expect(
      vocalizerOf(async () => Response.json([]))("שלום"),
    ).rejects.toThrow("nakdan returned no words");
    await expect(
      vocalizerOf(async () => Response.json({ error: "busy" }))("שלום"),
    ).rejects.toThrow("nakdan returned no words");
  });

  test("a vocalizer slower than NIKUD_TIMEOUT_MS is aborted", async () => {
    vi.stubEnv("NIKUD_TIMEOUT_MS", "20");
    const hanging: FetchImpl = (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason));
      });
    await expect(vocalizerOf(hanging)("שלום")).rejects.toThrow(
      /timeout|abort/i,
    );
  });
});
