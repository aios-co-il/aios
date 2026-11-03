import { describe, expect, test } from "vitest";
import {
  END_CARD_STYLES,
  SCENE_TRANSITIONS,
  endCardStyleOf,
  sceneTransitionOf,
} from "../src/compose/film-look.mjs";
import { isSkinSwitch } from "../src/compose/skin-switch.mjs";
import { buildTimeline } from "../src/compose/timeline.mjs";
import {
  sceneTransition,
  transitionFrames,
} from "../src/compose/workshop-edit.mjs";
import { buildWorkshopManifest } from "../src/compose/workshop-manifest.mjs";
import { loadFilmSettings, loadFilmSources } from "../src/jobs/render.mjs";
import {
  END_CARD_STYLES as CARMEN_END_CARDS,
  SCENE_TRANSITIONS as CARMEN_TRANSITIONS,
} from "../../supabase/functions/_shared/workshop/film-look.ts";

const scene = (id, extra = {}) => ({
  id,
  position: 1,
  clipPath: `${id}.mp4`,
  durationS: 2,
  ...extra,
});

/** How the film moves between scenes and closes (film-look.mjs). */
describe("film look", () => {
  test("only names Carmen can choose reach the film", () => {
    expect([...CARMEN_TRANSITIONS]).toEqual(SCENE_TRANSITIONS);
    expect([...CARMEN_END_CARDS]).toEqual(END_CARD_STYLES);
    expect(sceneTransitionOf("glitch")).toBe("glitch");
    expect(sceneTransitionOf("skin")).toBeNull();
    expect(sceneTransitionOf("<script>")).toBeNull();
    expect(endCardStyleOf("bold")).toBe("bold");
    expect(endCardStyleOf(3)).toBeNull();
  });

  test("a chosen whip, ripple or glitch is kept, at its own length", () => {
    for (const type of ["whip", "ripple", "glitch"])
      expect(sceneTransition(2, type)).toBe(type);
    expect(transitionFrames(90, 90, "whip")).toBe(9);
    expect(transitionFrames(90, 90, "glitch")).toBe(8);
    expect(transitionFrames(90, 90, "ripple")).toBe(20);
    expect(transitionFrames(90, 30, "ripple")).toBe(10);
    // The first scene still opens from black, and the others keep the cycle's 15 frames.
    expect(sceneTransition(0, "whip")).toBe("cut");
    expect(transitionFrames(90, 90, "slide")).toBe(15);
  });

  test("a scene's own transition wins over a skin switch", () => {
    const before = { pictureKey: "a" };
    expect(
      isSkinSwitch(before, { pictureKey: "b" }, { soundDesign: true }),
    ).toBe(true);
    expect(
      isSkinSwitch(
        before,
        { pictureKey: "b", transition: "ripple" },
        { soundDesign: true },
      ),
    ).toBe(false);
  });

  test("the scene's transition and the film's end card reach the manifest", () => {
    const timeline = buildTimeline(
      [
        scene("a"),
        scene("b", { position: 2, transition: "whip" }),
        scene("c", { position: 3, transition: "ripple" }),
      ],
      { endCardStyle: "minimal" },
    );
    expect(timeline.endCardStyle).toBe("minimal");
    expect(timeline.scenes[1].transition).toBe("whip");
    const { manifest } = buildWorkshopManifest({
      ...timeline,
      aspect: "9:16",
      scenes: [
        { id: "a", durationS: 2, clipPath: "a.mp4" },
        { id: "b", durationS: 2, clipPath: "b.mp4", transition: "whip" },
        { id: "c", durationS: 2, clipPath: "c.mp4", transition: "ripple" },
        { id: "d", durationS: 2, clipPath: "d.mp4", transition: "glitch" },
      ],
    });
    expect(manifest.endCardStyle).toBe("minimal");
    expect(manifest.scenes.map((s) => s.transition)).toStrictEqual([
      "cut",
      "whip",
      "ripple",
      "glitch",
    ]);
    expect(manifest.scenes.map((s) => s.transitionFrames)).toStrictEqual([
      0, 9, 20, 8,
    ]);
    const plain = buildWorkshopManifest({
      aspect: "9:16",
      scenes: [scene("x")],
    });
    expect(plain.manifest.endCardStyle).toBeUndefined();
  });

  test("the run reads the scene's meta.transition and the film's end_card_style", async () => {
    const row = (meta) => ({
      id: "s1",
      position: 1,
      overlay_text: "",
      voiceover_text: "",
      duration_s: 3,
      clip_asset_id: "clip-1",
      meta,
    });
    const sourcesFor = async (meta) => {
      const db = {
        select: async (table, query) => {
          if (!query.includes("tenant_id=eq.t1")) return [];
          if (table === "marketing_video_scenes") return [row(meta)];
          if (table === "marketing_assets")
            return [{ id: "clip-1", type: "video_clip", url: "t1/c.mp4" }];
          return [];
        },
      };
      const run = { id: "r1", tenant_id: "t1", item_id: "i1" };
      return (await loadFilmSources(db, run)).scenes[0];
    };
    expect((await sourcesFor({ transition: "glitch" })).transition).toBe(
      "glitch",
    );
    expect((await sourcesFor({ transition: "spin" })).transition).toBeNull();
    const settingsFor = (video) =>
      loadFilmSettings(
        { select: async () => [{ payload: { video } }] },
        { item_id: "i1", tenant_id: "t1" },
      );
    expect((await settingsFor({ end_card_style: "split" })).endCardStyle).toBe(
      "split",
    );
    expect((await settingsFor({ end_card_style: "neon" })).endCardStyle).toBe(
      null,
    );
  });
});
