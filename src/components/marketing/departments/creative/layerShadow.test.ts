import { expect, test } from "vitest";
import {
  buildLayerTextShadow,
  inferLayerShadow,
  withLayerShadow,
} from "./layerShadow.ts";

test("extrude depth adds that many solid offset steps", () => {
  const css = buildLayerTextShadow({
    shadowStyle: "extrude",
    shadowDepth: 6,
    shadowColor: "#1e3a8a",
    shadowBlur: 16,
  });
  expect(css).toBeTruthy();
  const steps = css.match(/\d+px \d+px 0 #1e3a8a/g) ?? [];
  expect(steps.length).toBe(6);
});

test("none produces no shadow css", () => {
  expect(buildLayerTextShadow({ shadowStyle: "none" })).toBe(undefined);
});

test("soft shadow keeps a single blur drop", () => {
  const css = buildLayerTextShadow({
    shadowStyle: "soft",
    shadowDepth: 8,
    shadowColor: "#000000",
    shadowBlur: 18,
  });
  expect(css).toBe("0 4px 18px #000000");
});

test("halo is an outline glow, not a caption plate", () => {
  const css = buildLayerTextShadow({
    shadowStyle: "halo",
    shadowDepth: 4,
    shadowColor: "#fde7ee",
    shadowBlur: 18,
  });
  expect(css).toBeTruthy();
  expect(css ?? "").toMatch(/0 0 18px #fde7ee/);
  expect(css ?? "").toMatch(/-1px 0 0 #fde7ee/);
});

test("infer restores extrude depth from existing designed layers", () => {
  const layer = {
    id: "1",
    type: "text" as const,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...withLayerShadow({
      shadowStyle: "extrude",
      shadowDepth: 8,
      shadowColor: "#1e3a8a",
      shadowBlur: 16,
    }),
  };
  const inferred = inferLayerShadow(layer);
  expect(inferred.shadowStyle).toBe("extrude");
  expect(inferred.shadowDepth).toBe(8);
  expect(inferred.shadowColor).toBe("#1e3a8a");
});

test("inferred shadow colors are always 6-digit hex", () => {
  const fromShort = inferLayerShadow({
    id: "1",
    type: "text",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    textShadow: "0 2px 8px #abc",
  });
  expect(fromShort.shadowColor).toMatch(/^#[0-9a-fA-F]{6}$/);
  const fromRgb = inferLayerShadow({
    id: "2",
    type: "text",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    textShadow: "0 2px 8px rgba(15, 23, 42, 0.4)",
  });
  expect(fromRgb.shadowColor).toBe("#0f172a");
});
