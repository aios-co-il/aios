import { expect, test } from "vitest";
import {
  emitWorkshopEvent,
  getWorkshopContext,
  setWorkshopContext,
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
  });
  expect(open?.taskSkills).toStrictEqual(["carmen_workshop"]);
  expect(open!.promptAddon).toMatch(/item_id=p-1 \(חג שמח\)/);
  expect(open!.promptAddon).toMatch(/artifact_id=a-9/);

  const blank = workshopRequestParts({
    projectId: null,
    title: null,
    selectedArtifactId: null,
  });
  expect(blank!.promptAddon).toMatch(/workshop_start_project/);
  expect(blank!.promptAddon).not.toMatch(/artifact_id/);
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

  setWorkshopContext({ projectId: "p", title: null, selectedArtifactId: null });
  expect(getWorkshopContext()?.projectId).toBe("p");
  setWorkshopContext(null);
  expect(getWorkshopContext()).toBe(null);
});

test("workshop tools get a Hebrew line in the chat, others keep their name", () => {
  expect(workshopToolLabel("workshop_make_creative")).toBe("יוצרת תמונות");
  expect(workshopToolLabel("create_lead")).toBe("create_lead");
  expect(workshopToolLabel(undefined)).toBe(undefined);
});
