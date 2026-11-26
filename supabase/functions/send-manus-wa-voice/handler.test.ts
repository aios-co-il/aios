import { assertEquals } from "jsr:@std/assert@1";
import {
  createVoiceNoteHandler,
  type VoiceLine,
  type VoiceNoteDeps,
} from "./handler.ts";

const SERVICE_KEY = "service-role-key";
const TENANT = "11111111-1111-4111-8111-111111111111";
const LINE_ID = "22222222-2222-4222-8222-222222222222";
const LINE: VoiceLine = {
  id: LINE_ID,
  tenantId: TENANT,
  apiKey: "manus-key",
  instanceId: "instance-1",
  gatewayUrl: null,
};

/** Fakes for every dependency, recording each send. */
function fakeDeps(overrides: Partial<VoiceNoteDeps> = {}) {
  const sent: Array<{ line: VoiceLine; to: string; fileUrl: string }> = [];
  const deps: VoiceNoteDeps = {
    serviceRoleKey: SERVICE_KEY,
    loadLine: () => Promise.resolve(LINE),
    speak: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    storeAudio: () => Promise.resolve("https://files/voice.ogg"),
    sendFile: (line, to, fileUrl) => {
      sent.push({ line, to, fileUrl });
      return Promise.resolve(true);
    },
    ...overrides,
  };
  return { deps, sent };
}

/** A POST to the function with this Authorization header and body. */
function voiceRequest(
  authorization: string | null,
  body: Record<string, unknown> = {
    tenant_id: TENANT,
    integration_id: LINE_ID,
    to: "972501234567@c.us",
    text: "שלום",
  },
): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization !== null) {
    headers.set("Authorization", authorization);
  }
  return new Request("https://edge/send-manus-wa-voice", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test("send-manus-wa-voice caller check (AIO-246)", async (t) => {
  for (const [name, authorization] of [
    ["no Authorization header", null],
    ["the public anon key", "Bearer public-anon-key"],
    [
      "a signed-in user's JWT",
      "Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.sig",
    ],
    [
      "a forged service_role JWT",
      "Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig",
    ],
    ["the key without Bearer", SERVICE_KEY],
  ] as const) {
    await t.step(`${name} is refused and nothing is sent`, async () => {
      const { deps, sent } = fakeDeps();

      const res = await createVoiceNoteHandler(deps)(
        voiceRequest(authorization),
      );

      assertEquals(res.status, 401);
      assertEquals(await res.json(), { error: "Unauthorized" });
      assertEquals(sent, []);
    });
  }

  await t.step("the service-role key sends the voice note", async () => {
    const { deps, sent } = fakeDeps();

    const res = await createVoiceNoteHandler(deps)(
      voiceRequest(`Bearer ${SERVICE_KEY}`),
    );

    assertEquals(res.status, 200);
    assertEquals(sent, [
      {
        line: LINE,
        to: "972501234567@c.us",
        fileUrl: "https://files/voice.ogg",
      },
    ]);
  });

  await t.step("an unset service-role key refuses everyone", async () => {
    const { deps, sent } = fakeDeps({ serviceRoleKey: "" });

    const res = await createVoiceNoteHandler(deps)(voiceRequest("Bearer "));

    assertEquals(res.status, 401);
    assertEquals(sent, []);
  });
});

Deno.test("send-manus-wa-voice request", async (t) => {
  await t.step("a body without text is refused before any read", async () => {
    let lineReads = 0;
    const { deps, sent } = fakeDeps({
      loadLine: () => {
        lineReads++;
        return Promise.resolve(LINE);
      },
    });

    const res = await createVoiceNoteHandler(deps)(
      voiceRequest(`Bearer ${SERVICE_KEY}`, {
        tenant_id: TENANT,
        integration_id: LINE_ID,
        to: "x",
        text: "**",
      }),
    );

    assertEquals(res.status, 400);
    assertEquals(lineReads, 0);
    assertEquals(sent, []);
  });

  await t.step("failed speech sends nothing and answers 502", async () => {
    const { deps, sent } = fakeDeps({ speak: () => Promise.resolve(null) });

    const res = await createVoiceNoteHandler(deps)(
      voiceRequest(`Bearer ${SERVICE_KEY}`),
    );

    assertEquals(res.status, 502);
    assertEquals(sent, []);
  });

  await t.step("a failure inside answers generic text", async () => {
    const { deps } = fakeDeps({
      storeAudio: () =>
        Promise.reject(new Error("upload failed: secret detail")),
    });

    const res = await createVoiceNoteHandler(deps)(
      voiceRequest(`Bearer ${SERVICE_KEY}`),
    );

    assertEquals(res.status, 500);
    assertEquals(await res.json(), { error: "Internal error" });
  });
});

Deno.test("send-manus-wa-voice receiving line (AIO-654)", async (t) => {
  await t.step("the note leaves from the line the request names", async () => {
    const reads: Array<[string, string]> = [];
    const { deps, sent } = fakeDeps({
      loadLine: (tenantId, integrationId) => {
        reads.push([tenantId, integrationId]);
        return Promise.resolve(LINE);
      },
    });

    const res = await createVoiceNoteHandler(deps)(
      voiceRequest(`Bearer ${SERVICE_KEY}`),
    );

    assertEquals(res.status, 200);
    assertEquals(reads, [[TENANT, LINE_ID]]);
    assertEquals(
      sent.map((send) => send.line.id),
      [LINE_ID],
    );
  });

  await t.step(
    "a line that cannot send sends nothing, from no other line",
    async () => {
      const { deps, sent } = fakeDeps({
        loadLine: () => Promise.resolve(null),
      });

      const res = await createVoiceNoteHandler(deps)(
        voiceRequest(`Bearer ${SERVICE_KEY}`),
      );

      assertEquals(res.status, 404);
      assertEquals(await res.json(), { error: "Line not available" });
      assertEquals(sent, []);
    },
  );

  await t.step(
    "a request without the line is refused before any read",
    async () => {
      let lineReads = 0;
      const { deps, sent } = fakeDeps({
        loadLine: () => {
          lineReads++;
          return Promise.resolve(LINE);
        },
      });

      const res = await createVoiceNoteHandler(deps)(
        voiceRequest(`Bearer ${SERVICE_KEY}`, {
          tenant_id: TENANT,
          to: "972501234567@c.us",
          text: "שלום",
        }),
      );

      assertEquals(res.status, 400);
      assertEquals(lineReads, 0);
      assertEquals(sent, []);
    },
  );
});
