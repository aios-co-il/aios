import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { errorMessage } from "./error-message.ts";
import { jsonObject } from "./json-config.ts";
import { isMetaNode, readMetaResponse } from "./meta-response.ts";

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

Deno.test(
  "Meta responses preserve numeric strings, actions, pagination and extra metrics",
  async () => {
    const payload = {
      data: [
        {
          campaign_id: "campaign-1",
          spend: "21.5",
          impressions: 100,
          actions: [{ action_type: "lead", value: "3" }],
          purchase_roas: [{ value: "2.5" }],
        },
      ],
      paging: { next: "https://graph.facebook.com/next" },
      summary: { total_count: 1 },
    };
    assertEquals(await readMetaResponse(response(payload)), payload);
  },
);

Deno.test(
  "Meta API errors and nullable fields survive decoding for existing fallback handling",
  async () => {
    const payload = {
      data: null,
      error: { message: "Token expired", code: 190, type: null },
      paging: null,
    };
    assertEquals(await readMetaResponse(response(payload, 400)), payload);
    const nullable = {
      id: null,
      spend: null,
      actions: null,
      cost_per_action_type: null,
      questions: null,
    };
    assertEquals(await readMetaResponse(response(nullable)), nullable);
    assertEquals(await readMetaResponse(response({ data: [] })), {
      data: [],
    });
  },
);

Deno.test(
  "malformed Graph envelopes cannot masquerade as typed campaign data",
  async () => {
    for (const payload of [
      null,
      [],
      "bad",
      { data: {} },
      { data: [null] },
      { data: [{ spend: {} }] },
      { actions: [{ value: {} }] },
      { questions: [{ label: 42 }] },
      { paging: { next: 3 } },
      { error: "expired" },
    ]) {
      await assertRejects(
        () => readMetaResponse(response(payload)),
        Error,
        "Invalid Meta response",
      );
    }
    await assertRejects(
      () => readMetaResponse(new Response("not-json")),
      SyntaxError,
    );
  },
);

Deno.test(
  "configured Meta pages accept nullable optional fields and reject malformed fields",
  () => {
    assertStrictEquals(
      isMetaNode({ id: "page-1", name: null, access_token: "page-token" }),
      true,
    );
    assertStrictEquals(isMetaNode({ id: "page-1", access_token: {} }), false);
  },
);

Deno.test(
  "persisted configuration keeps nested mappings intact while primitives have no keys",
  () => {
    const settings = {
      form_mappings: {
        form1: { agency_id: "agency-1", fields: { email: "EMAIL" } },
      },
      other: true,
    };
    assertStrictEquals(jsonObject(settings), settings);
    for (const value of [null, undefined, true, 42, "legacy", []]) {
      assertEquals(jsonObject(value), {});
    }
  },
);

Deno.test(
  "errorMessage reads message from errors and error-like objects",
  () => {
    assertStrictEquals(errorMessage(new Error("boom")), "boom");
    assertStrictEquals(errorMessage({ message: "postgrest" }), "postgrest");
    assertStrictEquals(errorMessage("plain string"), undefined);
    assertStrictEquals(errorMessage(null), undefined);
    assertStrictEquals(errorMessage({ code: 1 }), undefined);
  },
);
