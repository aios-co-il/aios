import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { dateChunks, fetchInsightsInChunks } from "./insightsChunks.ts";

/** The time range a stubbed Graph URL asks for. */
function rangeOf(url: string) {
  return JSON.parse(new URL(url).searchParams.get("time_range") ?? "{}");
}

/** Run a read against a stubbed Graph, restoring fetch after. */
async function readWith(
  answer: (range: { since: string; until: string }) => unknown,
  since: string,
  until: string,
) {
  const realFetch = globalThis.fetch;
  const asked: Array<string> = [];
  globalThis.fetch = (input) => {
    const range = rangeOf(String(input));
    asked.push(`${range.since}..${range.until}`);
    return Promise.resolve(new Response(JSON.stringify(answer(range))));
  };
  try {
    const rows = await fetchInsightsInChunks(
      { since, until },
      (chunk) =>
        `https://graph.facebook.com/v21.0/act_1/insights?time_range=${JSON.stringify(chunk)}`,
    );
    return { rows, asked };
  } finally {
    globalThis.fetch = realFetch;
  }
}

Deno.test("dateChunks", async (t) => {
  await t.step("cuts a long range into 30-day chunks", () => {
    assertEquals(dateChunks({ since: "2026-07-14", until: "2026-11-10" }), [
      { since: "2026-07-14", until: "2026-08-12" },
      { since: "2026-08-13", until: "2026-09-11" },
      { since: "2026-09-12", until: "2026-10-11" },
      { since: "2026-10-12", until: "2026-11-10" },
    ]);
  });

  await t.step("keeps a short range whole", () => {
    assertEquals(dateChunks({ since: "2026-10-24", until: "2026-10-26" }), [
      { since: "2026-10-24", until: "2026-10-26" },
    ]);
  });
});

Deno.test("fetchInsightsInChunks", async (t) => {
  await t.step("reads a 120-day first sync chunk by chunk", async () => {
    const { rows, asked } = await readWith(
      (range) => ({ data: [range.since] }),
      "2026-07-14",
      "2026-11-10",
    );
    assertEquals(asked.length, 4);
    assertEquals(rows, [
      "2026-07-14",
      "2026-08-13",
      "2026-09-12",
      "2026-10-12",
    ]);
  });

  await t.step(
    "splits a chunk Meta cannot serve and keeps every day",
    async () => {
      // Eco field trips: Meta times out on 30 days, answers 15.
      const { rows, asked } = await readWith(
        (range) =>
          range.since === "2026-10-12" && range.until === "2026-11-10"
            ? { error: { message: "An unknown error occurred", code: 1 } }
            : { data: [range.since] },
        "2026-10-12",
        "2026-11-10",
      );
      assertEquals(asked, [
        "2026-10-12..2026-11-10",
        "2026-10-12..2026-10-26",
        "2026-10-27..2026-11-10",
      ]);
      assertEquals(rows, ["2026-10-12", "2026-10-27"]);
    },
  );

  await t.step("a permission error still fails the read", async () => {
    await assertRejects(
      () =>
        readWith(
          () => ({ error: { message: "(#200) no ads_read", code: 200 } }),
          "2026-10-12",
          "2026-11-10",
        ),
      Error,
      "no ads_read",
    );
  });
});
