import { assertEquals } from "jsr:@std/assert@1";
import {
  elevenLabsConfig,
  mintElevenLabsSession,
} from "./elevenlabs-session.ts";
import { ELEVENLABS_VOICES } from "./elevenlabs-voices.ts";

const CONFIG = { apiKey: "key", agentId: "agent_1" };
const VOICE = ELEVENLABS_VOICES[1];

/** A fetch that records the request and answers with this status and body. */
function fakeFetch(status: number, body: unknown, seen: Array<Request> = []) {
  return (input: string | URL | Request, init?: RequestInit) => {
    seen.push(new Request(input, init));
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
}

Deno.test("config needs both the key and the agent id", () => {
  const env = (values: Record<string, string>) => (name: string) =>
    values[name];
  assertEquals(
    elevenLabsConfig(
      env({ ELEVENLABS_API_KEY: "k", ELEVENLABS_CARMEN_AGENT_ID: "a" }),
    ),
    { apiKey: "k", agentId: "a" },
  );
  assertEquals(elevenLabsConfig(env({ ELEVENLABS_API_KEY: "k" })), null);
  assertEquals(
    elevenLabsConfig(env({ ELEVENLABS_CARMEN_AGENT_ID: " " })),
    null,
  );
});

Deno.test(
  "an environment without the agent is refused as not configured",
  async () => {
    const result = await mintElevenLabsSession(
      null,
      "prompt",
      VOICE,
      fakeFetch(200, {}),
    );
    assertEquals(result, {
      ok: false,
      status: 503,
      error: "elevenlabs_not_configured",
    });
  },
);

Deno.test(
  "mints a signed url with the persona and the chosen voice",
  async () => {
    const seen: Array<Request> = [];
    const signed =
      "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_1&s=x";
    const result = await mintElevenLabsSession(
      CONFIG,
      "את כרמן",
      VOICE,
      fakeFetch(200, { signed_url: signed }, seen),
      "כן, אני איתך.",
    );
    assertEquals(seen[0].headers.get("xi-api-key"), "key");
    assertEquals(new URL(seen[0].url).searchParams.get("agent_id"), "agent_1");
    assertEquals(result, {
      ok: true,
      session: {
        provider: "elevenlabs",
        signed_url: signed,
        prompt: "את כרמן",
        first_message: "כן, אני איתך.",
        language: "he",
        voice: { id: VOICE.id, label: VOICE.label },
        voice_id: VOICE.voiceId,
      },
    });
  },
);

Deno.test("a refused or malformed signed url fails the session", async () => {
  const failed = {
    ok: false,
    status: 502,
    error: "elevenlabs_session_failed",
  } as const;
  assertEquals(
    await mintElevenLabsSession(
      CONFIG,
      "p",
      VOICE,
      fakeFetch(401, { detail: "bad key" }),
    ),
    failed,
  );
  assertEquals(
    await mintElevenLabsSession(
      CONFIG,
      "p",
      VOICE,
      fakeFetch(200, { signed_url: "http://x" }),
    ),
    failed,
  );
});
