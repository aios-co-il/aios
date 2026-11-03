import { expect, test } from "vitest";
import { buildTimeline } from "../src/compose/timeline.mjs";
import { titleSizeOf, titleStyleOf } from "../src/compose/title-style.mjs";

test("only known text styles and sizes reach the film", () => {
  expect(titleStyleOf("slide")).toBe("slide");
  expect(titleStyleOf("<script>")).toBeNull();
  expect(titleSizeOf("small")).toBe("small");
  expect(titleSizeOf(3)).toBeNull();
});

test("the timeline carries the film's and each scene's text style", () => {
  const timeline = buildTimeline(
    [{ id: "a", position: 1, clipPath: "a.mp4", titleStyle: "blur" }],
    { titleStyle: "pop", titleSize: "large" },
  );
  expect(timeline.titleStyle).toBe("pop");
  expect(timeline.titleSize).toBe("large");
  expect(timeline.scenes[0].titleStyle).toBe("blur");
  expect(timeline.scenes[0].titleSize).toBeNull();
});
