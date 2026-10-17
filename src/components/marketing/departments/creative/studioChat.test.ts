import assert from "node:assert/strict";
import { test } from "node:test";
import {
  needsChatApproval,
  parseSseBuffer,
  parseUiAction,
  studioContextAddon,
} from "./studioChat.ts";

test("SSE buffer keeps the unfinished tail and skips bad lines", () => {
  const { events, rest } = parseSseBuffer(
    'data: {"type":"token","content":"שלום"}\n\ndata: {broken\ndata: [DONE]\ndata: {"type":"ui_',
  );
  assert.deepEqual(events, [{ type: "token", content: "שלום" }]);
  assert.equal(rest, 'data: {"type":"ui_');
});

test("ui actions are validated before the studio runs them", () => {
  assert.equal(parseUiAction({ type: "rm_rf", item_id: "a" }), null);
  assert.equal(parseUiAction({ type: "produce_video" }), null);
  assert.equal(
    parseUiAction({ type: "open_drawer", item_id: "a", drawer: "x" }),
    null,
  );
  assert.deepEqual(
    parseUiAction({
      type: "regenerate_frame",
      item_id: "a",
      scene_id: "s",
      note: 3,
    }),
    { type: "regenerate_frame", item_id: "a", scene_id: "s" },
  );
});

test("only paid actions without their own dialog need a chat approval", () => {
  assert.equal(
    needsChatApproval({ type: "generate_variations", item_id: "a" }),
    true,
  );
  assert.equal(
    needsChatApproval({ type: "produce_video", item_id: "a" }),
    false,
  );
  assert.equal(needsChatApproval({ type: "focus_scene", item_id: "a" }), false);
});

test("context addon names the open project and what is on screen", () => {
  const addon = studioContextAddon({
    itemId: "i1",
    title: "פרומו",
    mode: "video",
    sceneCount: 4,
    sceneNumber: 2,
  });
  assert.match(addon, /item_id: i1/);
  assert.match(addon, /סצנה פתוחה כרגע: 2/);
  assert.doesNotMatch(addon, /וריאציות/);
});
