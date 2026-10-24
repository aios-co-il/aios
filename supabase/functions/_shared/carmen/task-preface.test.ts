import assert from "node:assert/strict";
import test from "node:test";
import { taskParts } from "./task-preface.ts";
import { wrapDirectPrompt } from "../agent-channel/prompts.ts";

const cursor = {
  route_type: "direct_channel",
  config: { profile: { displayName: "Dev Lead" } },
};

test("a connected agent gets its profile as the preface, the skin above the message", () => {
  const out = taskParts(cursor, "SKIN", "fix the login");
  assert.ok(out.preface.startsWith("[Agent profile set in AIOS]"));
  assert.ok(out.preface.includes("Dev Lead"));
  assert.equal(out.content, "SKIN\n\n---\n\nfix the login");
});

test("the dispatched prompt starts with the profile, before wrapper and history", () => {
  const { preface, content } = taskParts(cursor, "", "fix the login");
  const prompt = wrapDirectPrompt({
    origin: "cursor",
    userText: content,
    preface,
    history: [{ role: "user", content: "earlier" }],
  });
  assert.ok(prompt.startsWith("[Agent profile set in AIOS]"));
  assert.ok(
    prompt.indexOf("Dev Lead") < prompt.indexOf("[AIOS Command Center"),
  );
  assert.ok(prompt.indexOf("[AIOS Command Center") < prompt.indexOf("earlier"));
});

test("internal brain and empty parts leave the message unchanged", () => {
  const internal = { route_type: "internal", config: cursor.config };
  assert.deepEqual(taskParts(internal, "S", "hi"), {
    preface: "",
    content: "hi",
  });
  assert.deepEqual(taskParts({ route_type: "direct_channel" }, "", "hi"), {
    preface: "",
    content: "hi",
  });
});

test("parliament gets the skin but no single agent's profile", () => {
  const parliament = { route_type: "parliament", config: cursor.config };
  assert.deepEqual(taskParts(parliament, "SKIN", "hi"), {
    preface: "",
    content: "SKIN\n\n---\n\nhi",
  });
});
