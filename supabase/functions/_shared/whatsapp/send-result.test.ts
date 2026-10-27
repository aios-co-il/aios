import {
  assertEquals,
  assertMatch,
  assertStrictEquals,
} from "jsr:@std/assert@1";

import { fakeFetch } from "../testing/fake-fetch.ts";
import {
  interpretWaSendResponse,
  postWaSend,
  readWaSendResponse,
} from "./send-result.ts";

Deno.test("interpretWaSendResponse", async (t) => {
  await t.step("only a confirmed 2xx success counts as sent", () => {
    const sent = interpretWaSendResponse(200, {
      success: true,
      messageId: "m1",
    });
    assertStrictEquals(sent.sent, true);
    assertStrictEquals(sent.providerMessageId, "m1");
    assertStrictEquals(
      interpretWaSendResponse(200, { success: true, idMessage: "g1" })
        .providerMessageId,
      "g1",
    );
    assertStrictEquals(
      interpretWaSendResponse(200, { success: false }).status,
      "failed",
    );
    assertStrictEquals(
      interpretWaSendResponse(500, { error: "boom" }).error,
      "boom",
    );
    assertStrictEquals(interpretWaSendResponse(400, {}).error, "HTTP 400");
  });

  await t.step(
    "202 delivery unknown, staging block and duplicate skip are distinct",
    () => {
      assertStrictEquals(
        interpretWaSendResponse(202, { success: false, delivered: "unknown" })
          .status,
        "delivery_unknown",
      );
      const blocked = interpretWaSendResponse(403, {
        error: "blocked_by_staging_safe_mode",
        reason: "destination_not_allowlisted",
      });
      assertStrictEquals(blocked.status, "blocked_staging");
      assertMatch(blocked.error ?? "", /destination_not_allowlisted/);
      assertStrictEquals(
        interpretWaSendResponse(403, { error: "Forbidden" }).status,
        "failed",
      );
      const dup = interpretWaSendResponse(200, {
        success: true,
        skipped: "duplicate_identical_whatsapp",
      });
      assertStrictEquals(dup.status, "duplicate_skipped");
      assertStrictEquals(dup.sent, false);
    },
  );

  await t.step(
    "an edge timeout (504) or worker limit (546) may have sent: delivery_unknown",
    () => {
      for (const status of [504, 546]) {
        assertStrictEquals(
          interpretWaSendResponse(status, { error: "timeout" }).status,
          "delivery_unknown",
        );
      }
    },
  );
});

Deno.test("readWaSendResponse", async (t) => {
  await t.step(
    "non-JSON bodies are read as failures with their text",
    async () => {
      const out = await readWaSendResponse(
        new Response("upstream down", { status: 502 }),
      );
      assertStrictEquals(out.status, "failed");
      assertStrictEquals(out.error, "upstream down");
      assertStrictEquals(out.httpStatus, 502);
    },
  );
});

Deno.test("postWaSend", async (t) => {
  await t.step(
    "posts the body to the named function with the service-role key",
    async () => {
      const fetch = fakeFetch();
      const out = await postWaSend({
        fetchImpl: fetch.impl,
        supabaseUrl: "https://this-project.supabase.co",
        serviceRoleKey: "service-key",
        functionName: "send-manus-wa-message",
        body: { tenantId: "t1", message: "שלום" },
      });
      assertStrictEquals(out.status, "sent");
      assertStrictEquals(
        fetch.calls[0].url,
        "https://this-project.supabase.co/functions/v1/send-manus-wa-message",
      );
      assertEquals(fetch.calls[0].body, { tenantId: "t1", message: "שלום" });
      assertEquals(fetch.calls[0].init.headers, {
        "Content-Type": "application/json",
        Authorization: "Bearer service-key",
      });
    },
  );

  await t.step(
    "a network error is delivery_unknown, not a throw: the send may have left",
    async () => {
      const out = await postWaSend({
        fetchImpl: () => Promise.reject(new Error("connection reset")),
        supabaseUrl: "https://this-project.supabase.co",
        serviceRoleKey: "service-key",
        functionName: "send-manus-wa-message",
        body: {},
      });
      assertEquals(out, {
        sent: false,
        status: "delivery_unknown",
        error: "connection reset",
        providerMessageId: null,
        httpStatus: null,
      });
    },
  );
});
