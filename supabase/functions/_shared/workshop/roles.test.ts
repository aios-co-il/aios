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

test("the open project keeps short replies and picture edits with its specialist", () => {
  const film = { video: true, edit: false };
  assert.equal(workshopRole("תמשיכי", "creative_direct", film), "producer");
  assert.equal(
    workshopRole("תשני את התמונה בסצנה 2", "creative_direct", film),
    "producer",
  );
  assert.equal(
    workshopRole("תמשיכי", null, { video: true, edit: true }),
    "editor",
  );
  assert.equal(
    workshopRole("תכיני גם פוסט לפיד", "video_director", film),
    "designer",
  );
  assert.equal(
    workshopRole("תמשיכי", "video_director", { video: false, edit: false }),
    "producer",
  );
});

test("Hebrew film words match as whole words, with or without a prefix", () => {
  assert.equal(workshopRole("תעשי לי סרט", null), "producer");
  assert.equal(workshopRole("אפשר סרט?", null), "producer");
  assert.equal(workshopRole("תכיני ריל", null), "producer");
  assert.equal(workshopRole("תכיני ריל לאינסטגרם", null), "producer");
  assert.equal(workshopRole("תכיני לי את הסרט", null), "producer");
  assert.equal(workshopRole("ערכי את הסרטון", null), "editor");
  assert.equal(workshopRole("פוסט על הגריל החדש", null), "designer");
  assert.equal(workshopRole("פוסט לאפריל", null), "designer");
  assert.equal(workshopRole("סטורי לאינסטגרם", null), "designer");
});

test("brand values and history are not editing or story words", () => {
  assert.equal(workshopRole("סרטון על הערכים של המותג", null), "producer");
  assert.equal(workshopRole("סרטון על ערכי המותג", null), "producer");
  const film = { video: true, edit: false };
  assert.equal(
    workshopRole("סצנה על ההיסטוריה של המותג", "video_director", film),
    "producer",
  );
});

test("an edit command without 'את' still goes to the editor, brand values do not", () => {
  for (const text of [
    "ערכי הסרטון שלי",
    "ערכי הקטעים לסרטון אחד",
    "קחי את הקטעים וערכי לסרטון אחד",
  ])
    assert.equal(workshopRole(text, null, null), "editor", text);
  assert.notEqual(
    workshopRole("סרטון על ערכי המותג שלנו", null, null),
    "editor",
  );
});
