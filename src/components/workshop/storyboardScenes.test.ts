import { expect, test } from "vitest";
import {
  applySceneEdit,
  aspectRatioCss,
  changedText,
  filmAspect,
  sceneDraft,
  sceneState,
  spokenLine,
  storyboardScenes,
  totalSeconds,
  type SceneRow,
} from "./storyboardScenes";
import {
  SCENES_FOLDER,
  folderTabs,
  type WorkshopArtifact,
} from "./workshopFeed";

const row = (over: Partial<SceneRow> = {}): SceneRow => ({
  id: "s1",
  position: 1,
  title: "פתיחה",
  overlay_text: "כבר החלפת 8 קמפיינרים?",
  voiceover_text: "",
  motion_prompt: " slow push in ",
  duration_s: "3.5",
  status: "draft",
  still_asset_id: null,
  clip_asset_id: null,
  clip_stale: false,
  meta: {},
  ...over,
});

test("a scene's state follows its picture, its clip and its run", () => {
  expect(sceneState(row())).toBe("no_picture");
  expect(sceneState(row({ still_asset_id: "a", status: "still_ready" }))).toBe(
    "picture",
  );
  expect(sceneState(row({ status: "still_generating" }))).toBe("working");
  expect(
    sceneState(
      row({ still_asset_id: "a", clip_asset_id: "c", status: "clip_ready" }),
    ),
  ).toBe("clip_ready");
  expect(
    sceneState(
      row({ clip_asset_id: "c", clip_stale: true, status: "clip_ready" }),
    ),
  ).toBe("clip_stale");
  expect(sceneState(row({ clip_asset_id: "c", status: "failed" }))).toBe(
    "failed",
  );
});

test("cards follow the film order and carry the current still, clip and talking line", () => {
  const scenes = storyboardScenes(
    [
      row({
        id: "b",
        position: "2.5",
        clip_asset_id: "c1",
        still_asset_id: "p1",
      }),
      row({
        id: "a",
        position: 1,
        voiceover_text: "גיבוי",
        meta: { lipsync: true, speaker: "כרמן המעצבת", dialogue: "" },
      }),
    ],
    new Map([
      ["p1", { id: "p1", url: "https://x/still.png" }],
      ["c1", { id: "c1", url: "https://x/clip.mp4" }],
    ]),
  );
  expect(scenes.map((scene) => [scene.id, scene.number])).toStrictEqual([
    ["a", 1],
    ["b", 2],
  ]);
  expect(scenes[1]).toMatchObject({
    stillUrl: "https://x/still.png",
    clipUrl: "https://x/clip.mp4",
    motionPrompt: "slow push in",
    durationS: 3.5,
    lipsync: false,
  });
  // Like public.video_talking_line: an empty dialogue falls back to the narration.
  expect(scenes[0]).toMatchObject({ lipsync: true, speaker: "כרמן המעצבת" });
  expect(spokenLine(scenes[0])).toBe("גיבוי");
  expect(sceneDraft(scenes[0]).dialogue).toBe("גיבוי");
  expect(totalSeconds(scenes)).toBe(7);
});

test("only the texts the user changed are saved, and the board shows them at once", () => {
  const [talking] = storyboardScenes(
    [row({ meta: { lipsync: true, dialogue: "היי, אני כרמן" } })],
    new Map(),
  );
  const draft = sceneDraft(talking);
  expect(changedText(talking, draft)).toBe(null);
  expect(
    changedText(talking, { ...draft, overlay_text: "  חדש " }),
  ).toStrictEqual({
    overlay_text: "חדש",
  });
  expect(
    changedText(talking, { ...draft, dialogue: "שורה אחרת" }),
  ).toStrictEqual({
    dialogue: "שורה אחרת",
  });
  const [plain] = storyboardScenes([row({ id: "s2" })], new Map());
  // A scene that does not talk never writes a dialogue.
  expect(
    changedText(plain, {
      ...sceneDraft(plain),
      dialogue: "x",
      voiceover_text: "קול",
    }),
  ).toStrictEqual({ voiceover_text: "קול" });

  const edited = applySceneEdit([talking, plain], talking.id, {
    dialogue: "שורה אחרת",
  });
  expect(edited[0].dialogue).toBe("שורה אחרת");
  expect(edited[0].overlayText).toBe(talking.overlayText);
  expect(edited[1]).toBe(plain);
});

test("the film's frame is the project's format, Reels when it has none", () => {
  expect(filmAspect({ format: "4:5" })).toBe("4:5");
  expect(filmAspect({ format: "square" })).toBe("9:16");
  expect(filmAspect(null)).toBe("9:16");
  expect(aspectRatioCss("9:16")).toBe("9 / 16");
  expect(aspectRatioCss("weird")).toBe("9 / 16");
});

test("the scenes tab counts scenes and exists even without scene pages", () => {
  const page = (folder: string) => ({ folder }) as unknown as WorkshopArtifact;
  expect(folderTabs([page("copy")], 0).map((tab) => tab.folder)).toStrictEqual([
    "copy",
  ]);
  expect(folderTabs([page("copy"), page("video/film")], 5)).toContainEqual({
    folder: SCENES_FOLDER,
    label: "סצנות",
    count: 5,
  });
  expect(
    folderTabs(
      [page(SCENES_FOLDER), page(SCENES_FOLDER), page(SCENES_FOLDER)],
      6,
    ),
  ).toStrictEqual([{ folder: SCENES_FOLDER, label: "סצנות", count: 6 }]);
});
