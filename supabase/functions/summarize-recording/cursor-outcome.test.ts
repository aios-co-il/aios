import { assert, assertEquals } from "jsr:@std/assert@1";
import { cursorSummaryResponse } from "./cursor-outcome.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };

Deno.test("a failed Cursor dispatch lets the model write the summary", () => {
  assertEquals(
    cursorSummaryResponse(
      {
        ok: false,
        reason: "error",
        detail: "Cloud agent create 400: no access to repository",
      },
      CORS,
    ),
    null,
  );
});

Deno.test("a busy Cursor Direct lets the model write the summary", () => {
  assertEquals(
    cursorSummaryResponse({ ok: false, reason: "busy" }, CORS),
    null,
  );
});

Deno.test("no Cursor Direct setup lets the model write the summary", () => {
  assertEquals(
    cursorSummaryResponse({ ok: false, reason: "not_configured" }, CORS),
    null,
  );
});

Deno.test("a summary sent to Cursor returns its pending response", async () => {
  const res = cursorSummaryResponse(
    {
      ok: true,
      conversation_id: "conv",
      session_id: "sess",
      external_url: null,
    },
    CORS,
  );
  assert(res);
  assertEquals((await res.json()).channel, "cursor");
});
