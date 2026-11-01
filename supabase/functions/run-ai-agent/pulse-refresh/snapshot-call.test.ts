import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "jsr:@std/assert@1";
import { TENANT } from "./fake-deps.ts";
import {
  buildPulseRefreshRequestBody,
  interpretPulseSnapshotResponse,
} from "./snapshot.ts";
import { postSnapshot, type SnapshotEndpoint } from "./snapshot-call.ts";

/** A configured endpoint that calls `fetchImpl`. */
const endpoint = (fetchImpl: typeof fetch): SnapshotEndpoint => ({
  supabaseUrl: "https://example.supabase.co",
  serviceKey: "service-key",
  fetchImpl,
  timeoutMs: 1_000,
});

Deno.test("postSnapshot", async (t) => {
  await t.step(
    "a 200 answer that is not JSON is logged and read as a failed refresh",
    async () => {
      const warnings: unknown[] = [];
      const original = console.warn;
      console.warn = (...args: unknown[]) => warnings.push(args);
      try {
        const response = await postSnapshot(
          endpoint(async () => new Response("<html>gateway</html>")),
          buildPulseRefreshRequestBody(TENANT),
        );
        assertEquals(response, { ok: true, status: 200, body: null });
        assertStrictEquals(
          interpretPulseSnapshotResponse(TENANT, response).status,
          "refresh_failed",
        );
      } finally {
        console.warn = original;
      }
      assertStrictEquals(warnings.length, 1);
    },
  );

  await t.step("a call without URL or key never fetches", async () => {
    let fetches = 0;
    await assertRejects(
      () =>
        postSnapshot(
          {
            ...endpoint(async () => {
              fetches += 1;
              return Response.json({});
            }),
            supabaseUrl: null,
          },
          buildPulseRefreshRequestBody(TENANT),
        ),
      Error,
      "campaign-pulse-snapshot is not configured",
    );
    assertStrictEquals(fetches, 0);
  });
});
