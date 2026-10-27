import { expect, test } from "vitest";
import {
  needsChatApproval,
  parseSseBuffer,
  parseUiAction,
  STUDIO_STALL_MESSAGE,
  STUDIO_STALL_MS,
  studioContextAddon,
  studioToolLine,
} from "./studioChat.ts";

test("SSE buffer keeps the unfinished tail and skips bad lines", () => {
  const { events, rest } = parseSseBuffer(
    'data: {"type":"token","content":"שלום"}\n\ndata: {broken\ndata: [DONE]\ndata: {"type":"ui_',
  );
  expect(events).toStrictEqual([{ type: "token", content: "שלום" }]);
  expect(rest).toBe('data: {"type":"ui_');
});

test("ui actions are validated before the studio runs them", () => {
  expect(parseUiAction({ type: "rm_rf", item_id: "a" })).toBe(null);
  expect(parseUiAction({ type: "produce_video" })).toBe(null);
  expect(
    parseUiAction({ type: "open_drawer", item_id: "a", drawer: "x" }),
  ).toBe(null);
  expect(
    parseUiAction({
      type: "regenerate_frame",
      item_id: "a",
      scene_id: "s",
      note: 3,
    }),
  ).toStrictEqual({ type: "regenerate_frame", item_id: "a", scene_id: "s" });
});

test("only paid actions without their own dialog need a chat approval", () => {
  expect(needsChatApproval({ type: "generate_variations", item_id: "a" })).toBe(
    true,
  );
  expect(needsChatApproval({ type: "produce_video", item_id: "a" })).toBe(
    false,
  );
  expect(needsChatApproval({ type: "focus_scene", item_id: "a" })).toBe(false);
});

test("context addon names the open project and what is on screen", () => {
  const addon = studioContextAddon({
    itemId: "i1",
    title: "פרומו",
    mode: "video",
    sceneCount: 4,
    sceneNumber: 2,
  });
  expect(addon).toMatch(/item_id: i1/);
  expect(addon).toMatch(/סצנה פתוחה כרגע: 2/);
  expect(addon).not.toMatch(/וריאציות/);
});

test("every tool shows a progress line, other tools a generic one", () => {
  expect(studioToolLine("get_studio_state")).toBe("בודקת את הפרויקט");
  expect(studioToolLine("render_video_film")).toBe("מרכיבה סרט");
  expect(studioToolLine("get_carmen_skins")).toBe("בודקת את הסקינים שלה");
  expect(studioToolLine("list_clients")).toBe("כרמן עובדת…");
  expect(studioToolLine(undefined)).toBe("כרמן עובדת…");
});

test("the chat stops waiting after two silent minutes and says how to retry", () => {
  expect(STUDIO_STALL_MS).toBe(120_000);
  expect(STUDIO_STALL_MESSAGE).toMatch(/נסו לשלוח שוב/);
});
