import assert from "node:assert/strict";
import { test } from "node:test";
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
  assert.equal(workshopRequestParts(null), null);
});

test("an open project goes to Carmen with its id, a new board tells her to start one", () => {
  const open = workshopRequestParts({
    projectId: "p-1",
    title: "חג שמח",
    selectedArtifactId: "a-9",
  });
  assert.deepEqual(open?.taskSkills, ["carmen_workshop"]);
  assert.match(open!.promptAddon, /item_id=p-1 \(חג שמח\)/);
  assert.match(open!.promptAddon, /artifact_id=a-9/);

  const blank = workshopRequestParts({
    projectId: null,
    title: null,
    selectedArtifactId: null,
  });
  assert.match(blank!.promptAddon, /workshop_start_project/);
  assert.doesNotMatch(blank!.promptAddon, /artifact_id/);
});

test("only well-formed workshop stream events reach the board", () => {
  assert.deepEqual(
    workshopEventFrom({ type: "workshop", event: "project", item_id: "i", artifact_id: "a" }),
    { event: "project", item_id: "i", artifact_id: "a" },
  );
  assert.equal(workshopEventFrom({ type: "token", content: "x" }), null);
  assert.equal(workshopEventFrom({ type: "workshop", event: "other", item_id: "i" }), null);
  assert.equal(workshopEventFrom({ type: "workshop", event: "project" }), null);
  assert.equal(workshopEventFrom(null), null);
});

test("the board hears events and the context is shared", () => {
  const heard: string[] = [];
  const stop = subscribeWorkshopEvents((event) => heard.push(event.item_id));
  emitWorkshopEvent({ event: "artifacts", item_id: "i-1" });
  stop();
  emitWorkshopEvent({ event: "artifacts", item_id: "i-2" });
  assert.deepEqual(heard, ["i-1"]);

  setWorkshopContext({ projectId: "p", title: null, selectedArtifactId: null });
  assert.equal(getWorkshopContext()?.projectId, "p");
  setWorkshopContext(null);
  assert.equal(getWorkshopContext(), null);
});

test("workshop tools get a Hebrew line in the chat, others keep their name", () => {
  assert.equal(workshopToolLabel("workshop_make_creative"), "יוצרת תמונות");
  assert.equal(workshopToolLabel("create_lead"), "create_lead");
  assert.equal(workshopToolLabel(undefined), undefined);
});
