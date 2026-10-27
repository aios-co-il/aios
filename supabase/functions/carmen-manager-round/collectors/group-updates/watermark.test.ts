import { assertEquals } from "jsr:@std/assert@1";
import { advance, parseWatermark, readFrom } from "./watermark.ts";

const now = new Date("2026-11-10T17:30:00Z");
const since = new Date("2026-11-09T17:30:00Z");

Deno.test("parseWatermark", async (t) => {
  await t.step("a first run is floored at its own start", () => {
    assertEquals(parseWatermark(null, since), {
      floor: since.toISOString(),
      groups: {},
    });
  });

  await t.step("keeps the stored floor and well-formed marks", () => {
    const stored = {
      floor: "2026-11-01T17:30:00Z",
      groups: { g1: { at: "2026-11-09T10:00:00Z", id: "m1" }, g2: { at: 3 } },
    };
    assertEquals(parseWatermark(stored, since), {
      floor: "2026-11-01T17:30:00Z",
      groups: { g1: { at: "2026-11-09T10:00:00Z", id: "m1" } },
    });
  });
});

Deno.test("readFrom", () => {
  const old = { floor: "2026-10-01T00:00:00Z", groups: {} };
  assertEquals(readFrom(old, now).toISOString(), "2026-11-03T17:30:00.000Z");
  const fresh = { floor: "2026-11-08T00:00:00Z", groups: {} };
  assertEquals(readFrom(fresh, now).toISOString(), "2026-11-08T00:00:00.000Z");
});

Deno.test("advance", () => {
  const watermark = {
    floor: "2026-11-01T00:00:00Z",
    groups: {
      stale: { at: "2026-11-01T10:00:00Z", id: "a" },
      kept: { at: "2026-11-09T10:00:00Z", id: "b" },
    },
  };
  assertEquals(
    advance(watermark, { g: { at: "2026-11-10T09:00:00Z", id: "c" } }, now),
    {
      floor: "2026-11-01T00:00:00Z",
      groups: {
        kept: { at: "2026-11-09T10:00:00Z", id: "b" },
        g: { at: "2026-11-10T09:00:00Z", id: "c" },
      },
    },
  );
});
