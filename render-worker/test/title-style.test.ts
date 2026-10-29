import { expect, test } from "vitest";
import { buildTimeline } from "../src/compose/timeline.ts";
import { loadFilmSettings } from "../src/jobs/render.ts";
import {
  titleEmphasisOf,
  titleSizeOf,
  titleStyleOf,
} from "../src/compose/title-style.ts";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.ts";

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

test("only known key-word emphases reach the film", () => {
  expect(titleEmphasisOf("count")).toBe("count");
  expect(titleEmphasisOf("sparkle")).toBeNull();
  expect(titleEmphasisOf(undefined)).toBeNull();
});

test("a scene's own emphasis wins over the film's on its way to the manifest", () => {
  const scene = (id, extra = {}) => ({
    id,
    position: 1,
    clipPath: `/tmp/${id}.mp4`,
    stillPath: `/tmp/${id}.png`,
    clipProvider: "mock",
    overlayText: "20% הנחה",
    durationS: 2,
    ...extra,
  });
  const timeline = buildTimeline(
    [scene("own", { titleEmphasis: "stamp" }), scene("film")],
    { titleEmphasis: "count" },
  );
  expect(timeline.titleEmphasis).toBe("count");
  expect(timeline.scenes[0].titleEmphasis).toBe("stamp");
  const { manifest } = buildWorkshopManifest(timeline);
  expect(manifest.scenes.map((s) => s.titleEmphasis)).toEqual([
    "stamp",
    "count",
  ]);
  const plain = buildWorkshopManifest(buildTimeline([scene("x")]));
  expect(plain.manifest.scenes[0].titleEmphasis).toBeUndefined();
});

test("the film's emphasis is read from its work item, an unknown one is dropped", async () => {
  const settingsWith = (video) =>
    loadFilmSettings(
      { select: async () => [{ payload: { video } }] },
      { id: "r1", tenant_id: "t1", item_id: "i1" },
    );
  expect((await settingsWith({ title_emphasis: "marker" })).titleEmphasis).toBe(
    "marker",
  );
  expect(
    (await settingsWith({ title_emphasis: "sparkle" })).titleEmphasis,
  ).toBeNull();
});
