import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { overlayBrainEnv } from "./env.ts";
import { buildModelMessages } from "./messages.ts";
import { sanitizeProfile } from "./profile.ts";
import { isValidBrainSlug, slugFromName } from "./slug.ts";
import { baseUrlProblem, chatCompletionsUrl } from "./url.ts";

Deno.test("slugs come from names, avoid built-ins and taken slugs", () => {
  assertStrictEquals(slugFromName("GPT Copywriter"), "gpt-copywriter");
  assertStrictEquals(slugFromName("Cursor"), "cursor-brain");
  assertStrictEquals(slugFromName("מוח קופי"), "brain");
  assertStrictEquals(slugFromName("מוח קופי", ["brain"]), "brain-2");
  assertStrictEquals(slugFromName("GPT", ["gpt", "gpt-2"]), "gpt-3");
  assertStrictEquals(isValidBrainSlug("internal"), false);
  assertStrictEquals(isValidBrainSlug("my-gpt"), true);
});

Deno.test("base URLs must be public https", () => {
  assertStrictEquals(baseUrlProblem("https://api.openai.com/v1/"), null);
  assertMatch(baseUrlProblem("http://api.openai.com/v1") ?? "", /https/);
  assertMatch(baseUrlProblem("https://localhost/v1") ?? "", /public/);
  assertMatch(baseUrlProblem("https://10.0.0.5/v1") ?? "", /public/);
  assertMatch(baseUrlProblem("https://169.254.169.254/") ?? "", /public/);
  assertMatch(baseUrlProblem("https://[::1]/v1") ?? "", /public/);
  assertMatch(baseUrlProblem("https://u:p@api.x.ai/v1") ?? "", /credentials/);
  assertStrictEquals(baseUrlProblem("https://fdapi.example.com/v1"), null);
  assertStrictEquals(
    chatCompletionsUrl("https://api.x.ai/v1/chat/completions"),
    "https://api.x.ai/v1/chat/completions",
  );
});

Deno.test("profiles keep known fields within limits", () => {
  assertEquals(
    sanitizeProfile({
      system_prompt: "  be brief ",
      temperature: "3",
      max_tokens: 5,
      color: "red",
      junk: 1,
    }),
    { system_prompt: "be brief", temperature: 2, max_tokens: 16 },
  );
  assertEquals(sanitizeProfile(null), {});
});

Deno.test(
  "model messages: system prompt, recent history, no duplicate user turn",
  () => {
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
    assertEquals(
      msgs.map((m) => m.role),
      ["system", "user", "assistant", "user"],
    );
    const prefixed = buildModelMessages({
      profile: {},
      history: [{ role: "user", content: "fix it" }],
      content: "[skin]\n\n---\n\nfix it",
    });
    assertEquals(prefixed, [
      { role: "user", content: "[skin]\n\n---\n\nfix it" },
    ]);
    const fresh = buildModelMessages({
      profile: {},
      history: [],
      content: "q",
    });
    assertEquals(fresh, [{ role: "user", content: "q" }]);
  },
);

Deno.test("tenant UI keys win over env secrets; blanks do not", () => {
  const env = overlayBrainEnv(
    { CURSOR_API_KEY: "env", CLAUDE_ROUTINE_TOKEN: "env-claude" },
    { CURSOR_API_KEY: "ui", CLAUDE_ROUTINE_TOKEN: "  " },
  );
  assertStrictEquals(env.CURSOR_API_KEY, "ui");
  assertStrictEquals(env.CLAUDE_ROUTINE_TOKEN, "env-claude");
});
