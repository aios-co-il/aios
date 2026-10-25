import assert from "node:assert/strict";
import { test } from "node:test";
import {
  roleOfPersona,
  ROLE_TOOLS,
  toolsForRole,
  workshopRole,
} from "./roles.ts";

test("static creative goes to the designer", () => {
  assert.equal(
    workshopRole("תכיני לי פוסט לאינסטגרם על המבצע", null),
    "designer",
  );
  assert.equal(workshopRole("צריך באנר לקמפיין", null), "designer");
});

test("film concepts and generated films go to the producer", () => {
  assert.equal(workshopRole("תני לי קונספטים לסרטון פרומו", null), "producer");
  assert.equal(workshopRole("תנפישי את התמונות עם ליפ סינק", null), "producer");
});

test("a film from the user's own materials goes to the editor", () => {
  assert.equal(workshopRole("תערכי לי סרטון מהחומרים שהעליתי", null), "editor");
  assert.equal(workshopRole("make a video from my footage", null), "editor");
});

test("a reply with no signal stays with the current role", () => {
  assert.equal(workshopRole("כן, מאשרת", "video_director"), "producer");
  assert.equal(workshopRole("תמשיכי", "video_editor"), "editor");
  assert.equal(workshopRole("תמשיכי", null), "designer");
  assert.equal(roleOfPersona("workshop_editor"), "editor");
});

test("each role is offered only its own workshop tools, other tools stay", () => {
  const tools = [
    { name: "workshop_make_creative" },
    { name: "workshop_produce_video" },
    { name: "workshop_edit_from_assets" },
    { name: "kb_search" },
  ];
  const isWorkshop = (name: string) => name.startsWith("workshop_");
  assert.deepEqual(
    toolsForRole(tools, "designer", isWorkshop).map((t) => t.name),
    ["workshop_make_creative", "kb_search"],
  );
  assert.deepEqual(
    toolsForRole(tools, "editor", isWorkshop).map((t) => t.name),
    ["workshop_produce_video", "workshop_edit_from_assets", "kb_search"],
  );
  assert.equal(ROLE_TOOLS.producer.includes("workshop_make_creative"), false);
});
