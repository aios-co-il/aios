import { expect, test } from "vitest";
import {
  emitWorkshopEvent,
  getWorkshopContext,
  prefillComposer,
  prefilledDraft,
  scenePrefix,
  setWorkshopContext,
  subscribeComposerPrefill,
  subscribeWorkshopEvents,
  workshopEventFrom,
  workshopToolLabel,
  workshopRequestParts,
} from "./workshopBridge.ts";

test("outside the workshop the chat adds nothing", () => {
  expect(workshopRequestParts(null)).toBe(null);
});

test("an open project goes to Carmen with its id, a new board tells her to start one", () => {
  const open = workshopRequestParts({
    projectId: "p-1",
    title: "חג שמח",
    selectedArtifactId: "a-9",
    selectedSceneId: null,
    selectedSceneNumber: null,
  });
  expect(open?.taskSkills).toStrictEqual(["carmen_workshop"]);
  expect(open!.promptAddon).toMatch(/item_id=p-1 \(חג שמח\)/);
  expect(open!.promptAddon).toMatch(/artifact_id=a-9/);

  const blank = workshopRequestParts({
    projectId: null,
    title: null,
    selectedArtifactId: null,
    selectedSceneId: null,
    selectedSceneNumber: null,
  });
  expect(blank!.promptAddon).toMatch(/workshop_start_project/);
  expect(blank!.promptAddon).not.toMatch(/artifact_id/);
});

test("on a new board a question about Carmen is answered without a project", () => {
  const blank = workshopRequestParts({
    projectId: null,
    title: null,
    selectedArtifactId: null,
    selectedSceneId: null,
    selectedSceneNumber: null,
  })!.promptAddon;
  expect(blank).toMatch(/בקשת עבודה חדשה .*workshop_start_project/);
  expect(blank).toMatch(
    /שאלה עלייך או על המערכת מקבלת תשובה ישירה, בלי פרויקט/,
  );
});

test("only well-formed workshop stream events reach the board", () => {
  expect(
    workshopEventFrom({
      type: "workshop",
      event: "project",
      item_id: "i",
      artifact_id: "a",
    }),
  ).toStrictEqual({ event: "project", item_id: "i", artifact_id: "a" });
  expect(workshopEventFrom({ type: "token", content: "x" })).toBe(null);
  expect(
    workshopEventFrom({ type: "workshop", event: "other", item_id: "i" }),
  ).toBe(null);
  expect(workshopEventFrom({ type: "workshop", event: "project" })).toBe(null);
  expect(workshopEventFrom(null)).toBe(null);
});

test("the board hears events and the context is shared", () => {
  const heard: string[] = [];
  const stop = subscribeWorkshopEvents((event) => heard.push(event.item_id));
  emitWorkshopEvent({ event: "artifacts", item_id: "i-1" });
  stop();
  emitWorkshopEvent({ event: "artifacts", item_id: "i-2" });
  expect(heard).toStrictEqual(["i-1"]);

  setWorkshopContext({
    projectId: "p",
    title: null,
    selectedArtifactId: null,
    selectedSceneId: null,
    selectedSceneNumber: null,
  });
  expect(getWorkshopContext()?.projectId).toBe("p");
  setWorkshopContext(null);
  expect(getWorkshopContext()).toBe(null);
});

test("a scene picked on the board goes to Carmen with its id and number", () => {
  const addon = workshopRequestParts({
    projectId: "p-1",
    title: null,
    selectedArtifactId: null,
    selectedSceneId: "s-7",
    selectedSceneNumber: 3,
  })!.promptAddon;
  expect(addon).toContain(
    'הסצנה שהמשתמש בחר בלוח: scene_id=s-7 (סצנה 3). "את זה", "הסצנה הזאת" ו"שני" מתייחסים אליה; שינוי בה עם workshop_update_scene.',
  );
  expect(
    workshopRequestParts({
      projectId: "p-1",
      title: null,
      selectedArtifactId: null,
      selectedSceneId: null,
      selectedSceneNumber: null,
    })!.promptAddon,
  ).not.toMatch(/scene_id/);
});

test("a scene event from Carmen reaches the board with its scene", () => {
  expect(
    workshopEventFrom({
      type: "workshop",
      tool: "workshop_update_scene",
      event: "artifacts",
      item_id: "i",
      scene_id: "s",
    }),
  ).toStrictEqual({
    event: "artifacts",
    item_id: "i",
    artifact_id: undefined,
    scene_id: "s",
  });
  // Only the events Carmen's tools send.
  expect(
    workshopEventFrom({ type: "workshop", event: "scenes", item_id: "i" }),
  ).toBe(null);
});

test("a composer line nobody heard is dropped when the workshop closes", () => {
  prefillComposer(scenePrefix(5));
  setWorkshopContext(null);
  const heard: string[] = [];
  const stop = subscribeComposerPrefill((text) => heard.push(text));
  stop();
  expect(heard).toStrictEqual([]);
});

test("the composer gets the scene line, even when it opens after the board asked", () => {
  const heard: string[] = [];
  prefillComposer(scenePrefix(2));
  const stop = subscribeComposerPrefill((text) => heard.push(text));
  prefillComposer(scenePrefix(4));
  stop();
  const late: string[] = [];
  const again = subscribeComposerPrefill((text) => late.push(text));
  again();
  expect(heard).toStrictEqual(["סצנה 2: ", "סצנה 4: "]);
  expect(late).toStrictEqual([]);
});

test("a prefill keeps what the user already typed and replaces an older scene", () => {
  expect(prefilledDraft("", "סצנה 3: ")).toBe("סצנה 3: ");
  expect(prefilledDraft("סצנה 1: ", "סצנה 3: ")).toBe("סצנה 3: ");
  expect(prefilledDraft("סצנה 1: תקצרי", "סצנה 3: ")).toBe("סצנה 3: תקצרי");
  expect(prefilledDraft("יותר אנרגיה", "סצנה 3: ")).toBe("סצנה 3: יותר אנרגיה");
});

test("workshop tools get a Hebrew line in the chat, others keep their name", () => {
  expect(workshopToolLabel("workshop_update_scene")).toBe("משנה סצנה");
  expect(workshopToolLabel("workshop_edit_from_assets")).toBe(
    "עורכת סרט מהחומרים",
  );
  expect(workshopToolLabel("workshop_make_creative")).toBe("יוצרת תמונות");
  expect(workshopToolLabel("create_lead")).toBe("create_lead");
  expect(workshopToolLabel(undefined)).toBe(undefined);
});
