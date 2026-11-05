import { expect, test } from "vitest";
import {
  CREATIVE_COMPOSITIONS,
  buildCompositionLock,
  pickCompositionId,
  pickVariationComposition,
  compositionById,
  DEFAULT_COMPOSITION_ID,
  layoutRectsOverlap,
} from "./compositions.ts";

test("seven graphic architectures are available and structurally different", () => {
  expect(CREATIVE_COMPOSITIONS.length).toBe(7);
  expect(CREATIVE_COMPOSITIONS[0].id).toBe("offer");
  const signatures = CREATIVE_COMPOSITIONS.map(
    (item) => `${item.type.x}:${item.type.y}:${item.logo.x}`,
  );
  expect(new Set(signatures).size).toBe(signatures.length);
});

test("offer composition asks for a full-bleed photo and forbids a painted template", () => {
  const lock = buildCompositionLock("offer");
  expect(lock).toMatch(/full-bleed/i);
  expect(lock).toMatch(/diagonal/i);
  expect(lock).not.toMatch(/Leave the LEFT/i);
});

test("composition lock forbids the old caption template and copying faces from boards", () => {
  const lock = buildCompositionLock("rail");
  expect(lock).toMatch(/RAIL/);
  expect(lock).toMatch(/logo-top-right/i);
  expect(lock).toMatch(/not layout and not faces/i);
  expect(lock).toMatch(/Never default to a bottom-corner/i);
});

test("pickCompositionId prefers an unused structure", () => {
  const first = pickCompositionId("a");
  const second = pickCompositionId("b", [first]);
  expect(second).not.toBe(first);
});

test("auto generation never picks the Promo lead-gen offer board", () => {
  for (const seed of ["a", "b", "copy-1", "וריאציה 3", "seo / geo"]) {
    expect(pickVariationComposition({ seed })).not.toBe("offer");
    expect(pickCompositionId(seed, [], { exclude: ["offer"] })).not.toBe(
      "offer",
    );
  }
  expect(pickVariationComposition({ seed: "x", lockedId: "offer" })).toBe(
    "offer",
  );
});

test("auto generation rotates poster layouts across a grid", () => {
  const used: Array<
    "offer" | "flush" | "rail" | "slash" | "badge" | "flag" | "split"
  > = [];
  const picked = ["1", "2", "3", "4"].map((seed) => {
    const id = pickVariationComposition({ seed, used });
    used.push(id);
    return id;
  });
  expect(new Set(picked).size).toBe(4);
  expect(picked.includes("offer")).toBe(false);
});

test("missing composition falls back to flush, not the offer board", () => {
  expect(DEFAULT_COMPOSITION_ID).toBe("flush");
  expect(compositionById(undefined).id).toBe("flush");
});

test("flush logo is not bottom-left and does not sit under type or CTA", () => {
  const flush = compositionById("flush");
  expect(flush.logo.y < 20, "logo should sit near the top").toBeTruthy();
  expect(
    flush.logo.x > 50,
    "logo should not default to the left edge",
  ).toBeTruthy();
  expect(layoutRectsOverlap(flush.logo, flush.type)).toBe(false);
  expect(layoutRectsOverlap(flush.logo, flush.cta)).toBe(false);
});

test("no composition parks the logo on top of type or CTA", () => {
  for (const item of CREATIVE_COMPOSITIONS) {
    expect(
      layoutRectsOverlap(item.logo, item.type),
      `${item.id} logo vs type`,
    ).toBe(false);
    expect(
      layoutRectsOverlap(item.logo, item.cta),
      `${item.id} logo vs cta`,
    ).toBe(false);
  }
});

test("offer lock allows a soft pocket and forbids a painted silhouette", () => {
  const lock = buildCompositionLock("offer");
  expect(lock).toMatch(/quiet atmospheric pocket/i);
  expect(lock).toMatch(/drawn silhouette/i);
});
