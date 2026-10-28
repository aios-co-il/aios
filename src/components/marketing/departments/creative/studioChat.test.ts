import { expect, test } from "vitest";
import {
  chatParts,
  needsChatApproval,
  parseSseBuffer,
  parseUiAction,
  STUDIO_STALL_MESSAGE,
  STUDIO_STALL_MS,
  studioContextAddon,
  studioRunBody,
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

test("a skin portrait in Carmen's answer is shown as a picture", () => {
  const url = "https://aios.co.il/brand/carmen/designer.png";
  expect(chatParts(`הנה הסקינים:\n![המעצבת](${url})\nזהו`)).toStrictEqual([
    { kind: "text", text: "הנה הסקינים:\n" },
    { kind: "image", alt: "המעצבת", url },
    { kind: "text", text: "\nזהו" },
  ]);
  // Only a web link becomes a picture; anything else stays text as written.
  expect(chatParts("![x](javascript:alert(1))")).toStrictEqual([
    { kind: "text", text: "![x](javascript:alert(1))" },
  ]);
  expect(chatParts("בלי תמונות")).toStrictEqual([
    { kind: "text", text: "בלי תמונות" },
  ]);
});

test("every turn of a project's studio chat continues one conversation", () => {
  const turn = {
    message: "כן",
    tenantId: "t1",
    clientId: null,
    contextAddon: "--- הקשר ---",
    history: [{ role: "assistant" as const, content: "לשלוח?" }],
  };
  // The first turn starts it; the server's conversation id then rides on every later turn, so
  // a yes answers the dev task Carmen offered in the same conversation.
  expect(studioRunBody(turn)).not.toHaveProperty("conversation_id");
  const later = studioRunBody({ ...turn, conversationId: "conv-1" });
  expect(later.conversation_id).toBe("conv-1");
  expect(later.surface).toBe("internal_chat");
  expect(later.task_skills).toStrictEqual(["creative_studio"]);
  expect(later.conversation_history).toStrictEqual(turn.history);
});

test("the chat stops waiting after two silent minutes and says how to retry", () => {
  expect(STUDIO_STALL_MS).toBe(120_000);
  expect(STUDIO_STALL_MESSAGE).toMatch(/נסו לשלוח שוב/);
});
