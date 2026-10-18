import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  outboundAllowed,
  installStagingOutboundGuard,
  stagingRequestAllowed,
  STAGING_WHATSAPP_TEST_NUMBERS,
} from "./staging-outbound.mjs";
const own = "https://staging.supabase.co";
test("external sends and production calls blocked regardless of verb", () => {
  for (const [url, method] of [
    ["https://api.resend.com/emails", "POST"],
    ["https://api.telegram.org/bot123/sendMessage", "GET"],
    ["https://example.com/webhook", "POST"],
    ["https://production.supabase.co/functions/v1/trigger-automation", "GET"],
    ["https://graph.facebook.com/v22/123/messages", "POST"],
    ["https://graph.facebook.com/123/feed", "GET"],
    ["https://graph.facebook.com/v22/123?method=POST", "GET"],
    ["https://www.googleapis.com/calendar/v3/calendars/primary/events", "POST"],
    [`${own}/auth/v1/invite`, "POST"],
  ])
    assert.equal(outboundAllowed(url, method, own), false);
});
test("Google reporting and token refresh work without allowing calendar/email writes", () => {
  for (const url of [
    "https://oauth2.googleapis.com/token",
    "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query",
    "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aexample.com/searchAnalytics/query",
    "https://analyticsdata.googleapis.com/v1beta/properties/123:runReport",
    "https://googleads.googleapis.com/v23/customers/123/googleAds:searchStream",
  ])
    assert.equal(outboundAllowed(url, "POST", own), true, url);
  assert.equal(
    outboundAllowed("https://oauth2.googleapis.com/revoke", "POST", own),
    false,
  );
});
test("own database, analytics reads and inference stay usable", () => {
  for (const [url, method] of [
    [`${own}/rest/v1/clients`, "POST"],
    ["https://graph.facebook.com/v22/act_1/insights", "GET"],
    ["https://api.openai.com/v1/responses", "POST"],
    ["https://api.openai.com/v1/models", "GET"],
    ["https://api.cursor.com/v0/agents/bc_123", "GET"],
  ]) {
    assert.equal(outboundAllowed(url, method, own), true);
  }
});
test("workspace agent triggers and health probes accept UUID and legacy ids only", () => {
  for (const [url, method] of [
    [
      "https://api.chatgpt.com/v1/workspace_agents/bd01c76c-0d82-4966-bf48-f4002fb4d4f0/trigger",
      "POST",
    ],
    [
      "https://api.chatgpt.com/v1/workspace_agents/bd01c76c-0d82-4966-bf48-f4002fb4d4f0",
      "GET",
    ],
    [
      "https://api.chatgpt.com/v1/workspace_agents/agtch_abc123/trigger",
      "POST",
    ],
    ["https://api.chatgpt.com/v1/workspace_agents/agtch_abc123", "HEAD"],
  ])
    assert.equal(outboundAllowed(url, method, own), true, url);
  assert.equal(
    outboundAllowed(
      "https://api.chatgpt.com/v1/workspace_agents/not-a-trigger/trigger",
      "POST",
      own,
    ),
    false,
  );
});
test("Claude Direct can fire a routine but not manage routines", () => {
  assert.equal(
    outboundAllowed(
      "https://api.anthropic.com/v1/claude_code/routines/trig_01EMLfUVZhWHw5PJxPtgdb7x/fire",
      "POST",
      own,
    ),
    true,
  );
  assert.equal(
    outboundAllowed(
      "https://api.anthropic.com/v1/claude_code/routines/trig_01EMLfUVZhWHw5PJxPtgdb7x",
      "POST",
      own,
    ),
    false,
  );
  assert.equal(
    outboundAllowed(
      "https://api.anthropic.com/v1/claude_code/routines",
      "POST",
      own,
    ),
    false,
  );
});
test("guard never calls network for blocked request and disables redirect bypass", async () => {
  const calls = [];
  const runtime = {
    fetch: async (...args) => {
      calls.push(args);
      return new Response("{}");
    },
  };
  installStagingOutboundGuard(own, runtime);
  const res = await runtime.fetch(
    new Request("https://api.resend.com/emails", { method: "POST" }),
  );
  assert.equal(res.status, 409);
  assert.equal(calls.length, 0);
  await runtime.fetch(`${own}/rest/v1/clients`);
  assert.equal(calls[0][1].redirect, "error");
});
const david = "972507677613";
const green = "https://api.green-api.com/waInstance1101/sendMessage/tok";
const greenUpload =
  "https://api.green-api.com/waInstance1101/sendFileByUpload/tok";
const manus =
  "https://whatsappgw-pzpyrrww.manus.space/api/v1/instances/abc/send/text";
const meta = "https://graph.facebook.com/v21.0/123456/messages";
const post = (body) => ({ method: "POST", body });
test("WhatsApp test sends reach only David's direct chat", async () => {
  for (const [url, init] of [
    [green, post(JSON.stringify({ chatId: `${david}@c.us`, message: "hi" }))],
    [manus, post(JSON.stringify({ to: david, body: "hi" }))],
    [
      meta,
      post(JSON.stringify({ messaging_product: "whatsapp", to: `+${david}` })),
    ],
    [
      greenUpload,
      post(
        (() => {
          const f = new FormData();
          f.append("chatId", `${david}@c.us`);
          return f;
        })(),
      ),
    ],
  ])
    assert.equal(await stagingRequestAllowed(url, init, own), true, url);
  assert.equal(
    await stagingRequestAllowed(
      new Request(green, post(JSON.stringify({ chatId: `${david}@c.us` }))),
      undefined,
      own,
    ),
    true,
  );
  for (const [url, init] of [
    [green, post(JSON.stringify({ chatId: "972501234567@c.us" }))],
    [green, post(JSON.stringify({ chatId: `${david}-1600000000@g.us` }))],
    [green, post(JSON.stringify({ chatId: `0${david.slice(3)}@c.us` }))],
    [green, post(JSON.stringify({ chatId: `1${david}@c.us` }))],
    [green, { method: "GET" }],
    [green, post("not json")],
    [
      `${green}?chatId=${david}`,
      post(JSON.stringify({ chatId: `${david}@c.us` })),
    ],
    [
      "https://api.green-api.com/waInstance1101/sendPoll/tok",
      post(JSON.stringify({ chatId: `${david}@c.us` })),
    ],
    [
      "https://whatsappgw-pzpyrrww.manus.space/api/v1/instances/abc/send/group",
      post(JSON.stringify({ to: david, groupId: "x@g.us" })),
    ],
    [manus, post(JSON.stringify({ to: [david, "972501234567"] }))],
    [meta, post(JSON.stringify({ to: "972501234567" }))],
    [
      "https://evil.example/waInstance1101/sendMessage/tok",
      post(JSON.stringify({ chatId: `${david}@c.us` })),
    ],
  ])
    assert.equal(await stagingRequestAllowed(url, init, own), false, url);
});
test("app-level allowlist matches the edge guard list", async () => {
  const source = await readFile(
    new URL("./integration-guard.ts", import.meta.url),
    "utf8",
  );
  const list = /export const STAGING_WHATSAPP_TEST_NUMBERS = (\[[^\]]*\])/.exec(
    source,
  )[1];
  assert.deepEqual(JSON.parse(list), STAGING_WHATSAPP_TEST_NUMBERS);
});
