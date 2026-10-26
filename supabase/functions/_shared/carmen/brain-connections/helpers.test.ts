import assert from "node:assert/strict";
import test from "node:test";
import { overlayBrainEnv } from "./env.ts";
import { buildModelMessages } from "./messages.ts";
import { sanitizeProfile } from "./profile.ts";
import { isValidBrainSlug, slugFromName } from "./slug.ts";
import { baseUrlProblem, chatCompletionsUrl } from "./url.ts";

test("slugs come from names, avoid built-ins and taken slugs", () => {
  assert.equal(slugFromName("GPT Copywriter"), "gpt-copywriter");
  assert.equal(slugFromName("Cursor"), "cursor-brain");
  assert.equal(slugFromName("מוח קופי"), "brain");
  assert.equal(slugFromName("מוח קופי", ["brain"]), "brain-2");
  assert.equal(slugFromName("GPT", ["gpt", "gpt-2"]), "gpt-3");
  assert.equal(isValidBrainSlug("internal"), false);
  assert.equal(isValidBrainSlug("my-gpt"), true);
});

test("base URLs must be public https", () => {
  assert.equal(baseUrlProblem("https://api.openai.com/v1/"), null);
  assert.match(baseUrlProblem("http://api.openai.com/v1") ?? "", /https/);
  assert.match(baseUrlProblem("https://localhost/v1") ?? "", /public/);
  assert.match(baseUrlProblem("https://10.0.0.5/v1") ?? "", /public/);
  assert.match(baseUrlProblem("https://169.254.169.254/") ?? "", /public/);
  assert.match(baseUrlProblem("https://[::1]/v1") ?? "", /public/);
  assert.match(baseUrlProblem("https://u:p@api.x.ai/v1") ?? "", /credentials/);
  assert.equal(baseUrlProblem("https://fdapi.example.com/v1"), null);
  assert.equal(
    chatCompletionsUrl("https://api.x.ai/v1/chat/completions"),
    "https://api.x.ai/v1/chat/completions",
  );
});

test("profiles keep known fields within limits", () => {
  assert.deepEqual(
    sanitizeProfile({
      system_prompt: "  be brief ",
      temperature: "3",
      max_tokens: 5,
      color: "red",
      junk: 1,
    }),
    { system_prompt: "be brief", temperature: 2, max_tokens: 16 },
  );
  assert.deepEqual(sanitizeProfile(null), {});
});

test("model messages: system prompt, recent history, no duplicate user turn", () => {
  const msgs = buildModelMessages({
    profile: { system_prompt: "You are X" },
    history: [
      { role: "user", content: "hi" },
      { role: "tool_call", content: "ignored" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "next" },
    ],
    content: "next",
  });
  assert.deepEqual(
    msgs.map((m) => m.role),
    ["system", "user", "assistant", "user"],
  );
  const prefixed = buildModelMessages({
    profile: {},
    history: [{ role: "user", content: "fix it" }],
    content: "[skin]\n\n---\n\nfix it",
  });
  assert.deepEqual(prefixed, [
    { role: "user", content: "[skin]\n\n---\n\nfix it" },
  ]);
  const fresh = buildModelMessages({ profile: {}, history: [], content: "q" });
  assert.deepEqual(fresh, [{ role: "user", content: "q" }]);
});

test("tenant UI keys win over env secrets; blanks do not", () => {
  const env = overlayBrainEnv(
    { CURSOR_API_KEY: "env", CLAUDE_ROUTINE_TOKEN: "env-claude" },
    { CURSOR_API_KEY: "ui", CLAUDE_ROUTINE_TOKEN: "  " },
  );
  assert.equal(env.CURSOR_API_KEY, "ui");
  assert.equal(env.CLAUDE_ROUTINE_TOKEN, "env-claude");
});
