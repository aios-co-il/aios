import { assertEquals } from "jsr:@std/assert@1";
import { createVoiceNoteHandler, type VoiceLine } from "./handler.ts";
import {
  fakeDeps,
  LINE,
  LINE_ID,
  SERVICE_KEY,
  TENANT,
  voiceRequest,
} from "./handler.test-fixture.ts";

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

Deno.test("send-manus-wa-voice voice (AIO-654)", async (t) => {
  await t.step("speaks the line's voice; a body voice is ignored", async () => {
    const spoken: Array<string> = [];
    const lines: Array<VoiceLine> = [];
    const { deps } = fakeDeps({
      lineVoice: (line) => {
        lines.push(line);
        return Promise.resolve("cedar");
      },
      speak: (_text, voice) => {
        spoken.push(voice);
        return Promise.resolve(new Uint8Array([1]));
      },
    });

    const res = await createVoiceNoteHandler(deps)(
      voiceRequest(`Bearer ${SERVICE_KEY}`, {
        tenant_id: TENANT,
        integration_id: LINE_ID,
        to: "972501234567@c.us",
        text: "שלום",
        voice: "onyx",
      }),
    );

    assertEquals(res.status, 200);
    assertEquals(lines, [LINE]);
    assertEquals(spoken, ["cedar"]);
  });

  await t.step(
    "a voice text-to-speech refuses falls back to the default once",
    async () => {
      const spoken: Array<string> = [];
      const { deps, sent } = fakeDeps({
        speak: (_text, voice) => {
          spoken.push(voice);
          return Promise.resolve(
            voice === "shimmer" ? new Uint8Array([1]) : null,
          );
        },
      });

      const res = await createVoiceNoteHandler(deps)(
        voiceRequest(`Bearer ${SERVICE_KEY}`),
      );

      assertEquals(res.status, 200);
      assertEquals(spoken, ["cedar", "shimmer"]);
      assertEquals(sent.length, 1);
    },
  );

  await t.step("a refused default is not tried twice", async () => {
    const spoken: Array<string> = [];
    const { deps, sent } = fakeDeps({
      lineVoice: () => Promise.resolve("shimmer"),
      speak: (_text, voice) => {
        spoken.push(voice);
        return Promise.resolve(null);
      },
    });

    const res = await createVoiceNoteHandler(deps)(
      voiceRequest(`Bearer ${SERVICE_KEY}`),
    );

    assertEquals(res.status, 502);
    assertEquals(spoken, ["shimmer"]);
    assertEquals(sent, []);
  });
});
