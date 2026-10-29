import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import type { AssetView } from "./assets.ts";
import { pickMaterials, planEditScenes, spokenSeconds } from "./edit-plan.ts";

const asset = (
  id: string,
  asset_type: AssetView["asset_type"],
  extra: Partial<AssetView> = {},
): AssetView => ({
  id,
  asset_type,
  source: "user",
  title: id,
  url: null,
  storage_path: `tenant-1/workshop/item-1/${id}`,
  text: null,
  use_as_reference: false,
  meta: {},
  created_at: "2026-10-25",
  ...extra,
});

Deno.test(
  "only videos and pictures with a file become scenes, in upload order",
  () => {
    const picked = pickMaterials(
      [
        asset("v1", "video"),
        asset("doc", "file"),
        asset("i1", "image"),
        asset("link", "link", { storage_path: null, url: "https://a.co" }),
        asset("i2", "image", { storage_path: null, url: null }),
      ],
      undefined,
    );
    assertEquals(
      picked.map((a) => a.id),
      ["v1", "i1"],
    );
  },
);

Deno.test("asked ids set the order and unknown ids are skipped", () => {
  const picked = pickMaterials(
    [asset("v1", "video"), asset("i1", "image")],
    ["i1", "nope", "v1"],
  );
  assertEquals(
    picked.map((a) => a.id),
    ["i1", "v1"],
  );
});

Deno.test(
  "a video is the scene's clip, a picture its still, with captions and voice by order",
  () => {
    let n = 0;
    const plan = planEditScenes(
      [asset("v1", "video", { meta: { duration_s: 7 } }), asset("i1", "image")],
      { captions: ["פתיחה", "סגירה"], voiceover: ["שלום"], image_seconds: 2 },
      () => `scene-${++n}`,
    );
    assertStrictEquals(plan[0].kind, "clip");
    assertStrictEquals(plan[0].row.duration_s, 7);
    assertStrictEquals(plan[0].row.overlay_text, "פתיחה");
    assertStrictEquals(plan[0].row.voiceover_text, "שלום");
    assertStrictEquals(plan[1].kind, "still");
    assertStrictEquals(plan[1].row.duration_s, 2);
    assertStrictEquals(plan[1].row.voiceover_text, "");
    assertEquals(
      plan.map((s) => s.row.position),
      [1, 2],
    );
  },
);

Deno.test(
  "a picture with a line talks in its own scene; a video never does",
  () => {
    let n = 0;
    const plan = planEditScenes(
      [
        asset("i1", "image"),
        asset("i2", "image"),
        asset("v1", "video"),
        asset("i3", "image"),
        asset("i4", "image"),
      ],
      {
        motion: ["push in", "turn to camera", "", "orbit", "tilt up"],
        // Implied by the line, refused for the video, switched off, and from the voiceover.
        lipsync: [null, null, true, false, true],
        dialogue: ["", "אני כרמן", "שלום", "לא מדברת", ""],
        voiceover: ["", "", "", "", "אני מפוקחת על ידי צוות אנושי"],
        speaker: "Carmen, a 3D animated woman",
        durations: [null, null, null, 6],
      },
      () => `scene-${++n}`,
    );
    assertEquals(
      plan.map((scene) => scene.talking),
      [false, true, false, false, true],
    );
    assertEquals(
      plan.map((scene) => scene.row.motion_prompt),
      ["push in", "turn to camera", "", "orbit", "tilt up"],
    );
    assertStrictEquals(plan[0].row.lipsync, undefined);
    assertStrictEquals(plan[1].row.lipsync, true);
    assertStrictEquals(plan[1].row.dialogue, "אני כרמן");
    // One speaker string stands for every talking scene.
    assertStrictEquals(plan[1].row.speaker, "Carmen, a 3D animated woman");
    assertStrictEquals(plan[4].row.speaker, "Carmen, a 3D animated woman");
    assertStrictEquals(plan[2].row.lipsync, undefined);
    assertStrictEquals(plan[3].row.duration_s, 6);
    // The line from the voiceover: 6 words need 3 s on screen.
    assertStrictEquals(plan[4].row.dialogue, "");
    assertStrictEquals(
      plan[4].row.duration_s,
      spokenSeconds(plan[4].row.voiceover_text),
    );
    assertStrictEquals(spokenSeconds("אני מפוקחת על ידי צוות אנושי"), 3);
    assertStrictEquals(spokenSeconds(Array(60).fill("מילה").join(" ")), 15);
  },
);

Deno.test(
  "skin_switch marks the cuts between the pictures, for the film or per scene",
  () => {
    const pictures = [
      asset("i1", "image"),
      asset("i2", "image"),
      asset("i2", "image"),
      asset("v1", "video"),
    ];
    // One boolean for the film: every cut to another picture, never the first scene.
    assertEquals(
      planEditScenes(pictures, { skin_switch: true }).map((s) => s.skinSwitch),
      [null, true, false, true],
    );
    assertEquals(
      planEditScenes(pictures, { skin_switch: false }).map((s) => s.skinSwitch),
      [null, false, false, false],
    );
    // Per scene, as asked; without it the film decides.
    assertEquals(
      planEditScenes(pictures, { skin_switch: [false, true, null] }).map(
        (s) => s.skinSwitch,
      ),
      [false, true, null, null],
    );
    assertEquals(
      planEditScenes(pictures, {}).map((s) => s.skinSwitch),
      [null, null, null, null],
    );
  },
);
